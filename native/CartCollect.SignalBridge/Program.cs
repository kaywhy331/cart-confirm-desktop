using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Linq;
using System.Net;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;
using System.Threading;
using System.Threading.Tasks;
using System.Windows;
using Windows.ApplicationModel;
using Windows.UI.Notifications;
using Windows.UI.Notifications.Management;

namespace CartCollect.SignalBridge;

internal sealed class BridgeConfig
{
    public int SchemaVersion { get; set; }
    public bool Enabled { get; set; }
    public bool DeliveryPaused { get; set; }
    public bool StartAtLogin { get; set; }
    public string Token { get; set; } = "";
    public int[] ApiPorts { get; set; } = [];
    public string PendingDirectory { get; set; } = "";
    public string FailedDirectory { get; set; } = "";
    public string StatusPath { get; set; } = "";
    public string CartCollectExecutable { get; set; } = "";
    public string RequestAccessNonce { get; set; } = "";
}

internal sealed class SignalEnvelope
{
    public int SchemaVersion { get; set; } = 1;
    public string SignalId { get; set; } = "";
    public bool TestSignal { get; set; }
    public SignalSource Source { get; set; } = new();
    public SignalNotification Notification { get; set; } = new();
}

internal sealed class SignalSource
{
    public string Provider { get; set; } = "trackalacker";
    public string Transport { get; set; } = "windows_chrome_notification";
    public string NotificationId { get; set; } = "";
    public string ApplicationName { get; set; } = "";
    public string ApplicationId { get; set; } = "";
    public string Domain { get; set; } = "trackalacker.com";
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset ReceivedAt { get; set; }
}

internal sealed class SignalNotification
{
    public string Title { get; set; } = "";
    public string Body { get; set; } = "";
    public string[] TextElements { get; set; } = [];
}

internal sealed class BridgeStatus
{
    public string State { get; set; } = "starting";
    public string Permission { get; set; } = "unknown";
    public bool ListenerReady { get; set; }
    public string StartupState { get; set; } = "unknown";
    public int PendingSignals { get; set; }
    public string LastNotificationAt { get; set; } = "";
    public string LastDeliveryAt { get; set; } = "";
    public int LastResponseStatus { get; set; }
    public string LastResponse { get; set; } = "";
    public string LastError { get; set; } = "";
    public DateTimeOffset UpdatedAt { get; set; } = DateTimeOffset.UtcNow;
}

internal sealed class BridgeHost : IDisposable
{
    private static readonly int[] RetryDelaysMs = [0, 250, 500, 1_000, 2_000, 5_000];
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web)
    {
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull,
        WriteIndented = true
    };

    private readonly string _configPath;
    private readonly HttpClient _http = new() { Timeout = TimeSpan.FromSeconds(2) };
    private readonly SemaphoreSlim _syncGate = new(1, 1);
    private readonly SemaphoreSlim _deliveryGate = new(1, 1);
    private readonly HashSet<uint> _knownNotificationIds = [];
    private readonly BridgeStatus _status = new();
    private readonly FileSystemWatcher _configWatcher;
    private BridgeConfig _config;
    private UserNotificationListener? _listener;
    private DateTimeOffset _lastLaunchAt = DateTimeOffset.MinValue;
    private string _requestAccessNonce;

    public BridgeHost(string configPath)
    {
        _configPath = Path.GetFullPath(configPath);
        _config = ReadConfig(_configPath);
        _requestAccessNonce = _config.RequestAccessNonce;
        var directory = Path.GetDirectoryName(_configPath)
            ?? throw new InvalidOperationException("Signal bridge config directory is invalid.");
        _configWatcher = new FileSystemWatcher(directory, Path.GetFileName(_configPath))
        {
            NotifyFilter = NotifyFilters.LastWrite | NotifyFilters.FileName | NotifyFilters.CreationTime
        };
        _configWatcher.Changed += ConfigChanged;
        _configWatcher.Created += ConfigChanged;
        _configWatcher.Renamed += ConfigChanged;
        _configWatcher.EnableRaisingEvents = true;
    }

    public static BridgeConfig ReadConfig(string configPath)
    {
        var config = JsonSerializer.Deserialize<BridgeConfig>(File.ReadAllText(configPath), JsonOptions)
            ?? throw new InvalidOperationException("Signal bridge config is empty.");
        if (config.SchemaVersion != 1
            || config.Token.Length < 32
            || config.ApiPorts.Length == 0
            || string.IsNullOrWhiteSpace(config.PendingDirectory)
            || string.IsNullOrWhiteSpace(config.StatusPath))
        {
            throw new InvalidOperationException("Signal bridge config is invalid.");
        }
        return config;
    }

    public async Task InitializeAsync()
    {
        await ReconcileStartupAsync();
        _listener = UserNotificationListener.Current;
        var access = _listener.GetAccessStatus();
        _status.Permission = access.ToString().ToLowerInvariant();
        if (access != UserNotificationListenerAccessStatus.Allowed)
        {
            _status.State = "permission-required";
            _status.ListenerReady = false;
            await WriteStatusAsync();
            return;
        }

        IReadOnlyList<UserNotification> current = await _listener.GetNotificationsAsync(NotificationKinds.Toast);
        foreach (var notification in current) _knownNotificationIds.Add(notification.Id);
        _listener.NotificationChanged += NotificationChanged;
        _status.State = !_config.Enabled
            ? "disabled"
            : _config.DeliveryPaused ? "delivery-paused" : "ready";
        _status.ListenerReady = true;
        await WriteStatusAsync();
        await DeliverPendingAsync();
    }

    public async Task<UserNotificationListenerAccessStatus> RequestAccessAsync()
    {
        _listener = UserNotificationListener.Current;
        var access = await _listener.RequestAccessAsync();
        _status.Permission = access.ToString().ToLowerInvariant();
        _status.State = access == UserNotificationListenerAccessStatus.Allowed ? "ready" : "permission-required";
        _status.ListenerReady = access == UserNotificationListenerAccessStatus.Allowed;
        await WriteStatusAsync();
        return access;
    }

    public async Task ReconcileStartupAsync()
    {
        var startupTask = await StartupTask.GetAsync("CartCollectSignalBridgeStartup");
        if (_config.StartAtLogin && startupTask.State == StartupTaskState.Disabled)
        {
            await startupTask.RequestEnableAsync();
        }
        else if (!_config.StartAtLogin && startupTask.State == StartupTaskState.Enabled)
        {
            startupTask.Disable();
        }
        _status.StartupState = startupTask.State.ToString().ToLowerInvariant();
        await WriteStatusAsync();
    }

    private void ConfigChanged(object sender, FileSystemEventArgs args)
    {
        _ = Application.Current.Dispatcher.InvokeAsync(async () =>
        {
            try
            {
                var nextConfig = ReadConfig(_configPath);
                var requestAccess = !string.IsNullOrWhiteSpace(nextConfig.RequestAccessNonce)
                    && nextConfig.RequestAccessNonce != _requestAccessNonce;
                _config = nextConfig;
                _requestAccessNonce = nextConfig.RequestAccessNonce;
                await ReconcileStartupAsync();
                if (requestAccess) await RequestAccessAsync();
                _status.State = !_config.Enabled
                    ? "disabled"
                    : _config.DeliveryPaused ? "delivery-paused" : "ready";
                _status.LastError = "";
                await WriteStatusAsync();
                if (_config.Enabled && !_config.DeliveryPaused) await DeliverPendingAsync();
            }
            catch (Exception error)
            {
                await RecordErrorAsync(error);
            }
        });
    }

    private async void NotificationChanged(UserNotificationListener sender, UserNotificationChangedEventArgs args)
    {
        try
        {
            await SyncNotificationsAsync();
        }
        catch (Exception error)
        {
            await RecordErrorAsync(error);
        }
    }

    private async Task SyncNotificationsAsync()
    {
        if (_listener is null || !await _syncGate.WaitAsync(0)) return;
        try
        {
            if (_listener.GetAccessStatus() != UserNotificationListenerAccessStatus.Allowed)
            {
                _status.Permission = "denied";
                _status.ListenerReady = false;
                _status.State = "permission-required";
                await WriteStatusAsync();
                return;
            }
            IReadOnlyList<UserNotification> current = await _listener.GetNotificationsAsync(NotificationKinds.Toast);
            var currentIds = current.Select(notification => notification.Id).ToHashSet();
            foreach (var notification in current.Where(notification => !_knownNotificationIds.Contains(notification.Id)))
            {
                await CaptureNotificationAsync(notification);
            }
            _knownNotificationIds.Clear();
            foreach (var id in currentIds) _knownNotificationIds.Add(id);
        }
        finally
        {
            _syncGate.Release();
        }
    }

    private async Task CaptureNotificationAsync(UserNotification userNotification)
    {
        if (!_config.Enabled) return;
        try
        {
            var applicationName = Clean(userNotification.AppInfo.DisplayInfo.DisplayName, 160);
            var applicationId = Clean(userNotification.AppInfo.AppUserModelId, 240);
            if (!IsGoogleChromeApplication(applicationName, applicationId)) return;

            var binding = userNotification.Notification.Visual.GetBinding(KnownNotificationBindings.ToastGeneric);
            if (binding is null) return;
            var text = binding.GetTextElements()
                .Select(element => Clean(element.Text, 500))
                .Where(value => value.Length > 0)
                .Take(16)
                .ToArray();
            if (!text.Any(IsTrackalackerAttribution)) return;

            var createdAt = userNotification.CreationTime;
            var receivedAt = DateTimeOffset.UtcNow;
            var envelope = new SignalEnvelope
            {
                SignalId = $"windows:chrome:{userNotification.Id}:{createdAt.ToUnixTimeMilliseconds()}",
                Source = new SignalSource
                {
                    NotificationId = userNotification.Id.ToString(),
                    ApplicationName = applicationName,
                    ApplicationId = applicationId,
                    CreatedAt = createdAt,
                    ReceivedAt = receivedAt
                },
                Notification = new SignalNotification
                {
                    Title = text.FirstOrDefault() ?? "",
                    Body = string.Join('\n', text.Skip(1)),
                    TextElements = text
                }
            };
            await PersistEnvelopeAsync(envelope);
            _status.LastNotificationAt = receivedAt.ToString("O");
            await WriteStatusAsync();
            if (!_config.DeliveryPaused) await DeliverPendingAsync();
        }
        catch (Exception error)
        {
            await RecordErrorAsync(error);
        }
    }

    private async Task PersistEnvelopeAsync(SignalEnvelope envelope)
    {
        Directory.CreateDirectory(_config.PendingDirectory);
        var digest = Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(envelope.SignalId))).ToLowerInvariant();
        var destination = Path.Combine(_config.PendingDirectory, $"{digest}.json");
        if (File.Exists(destination)) return;
        var temporary = $"{destination}.{Environment.ProcessId}.tmp";
        await File.WriteAllTextAsync(temporary, JsonSerializer.Serialize(envelope, JsonOptions), Encoding.UTF8);
        File.Move(temporary, destination, false);
    }

    private async Task DeliverPendingAsync()
    {
        if (!_config.Enabled || _config.DeliveryPaused || !await _deliveryGate.WaitAsync(0)) return;
        try
        {
            Directory.CreateDirectory(_config.PendingDirectory);
            foreach (var filePath in Directory.EnumerateFiles(_config.PendingDirectory, "*.json")
                .OrderBy(File.GetCreationTimeUtc)
                .ThenBy(path => path, StringComparer.Ordinal))
            {
                if (!_config.Enabled || _config.DeliveryPaused) break;
                await DeliverFileAsync(filePath);
            }
        }
        finally
        {
            _deliveryGate.Release();
            await WriteStatusAsync();
        }
    }

    private async Task DeliverFileAsync(string filePath)
    {
        SignalEnvelope? envelope;
        string payload;
        try
        {
            payload = await File.ReadAllTextAsync(filePath);
            envelope = JsonSerializer.Deserialize<SignalEnvelope>(payload, JsonOptions);
            if (envelope is null || string.IsNullOrWhiteSpace(envelope.SignalId)) throw new InvalidDataException("Pending signal is invalid.");
        }
        catch (Exception error)
        {
            await MoveFailedAsync(filePath, error.Message);
            return;
        }

        var launched = false;
        foreach (var delay in RetryDelaysMs)
        {
            if (delay > 0) await Task.Delay(delay);
            foreach (var port in _config.ApiPorts.Distinct())
            {
                try
                {
                    using var request = new HttpRequestMessage(HttpMethod.Post, $"http://127.0.0.1:{port}/api/v1/signals");
                    request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", _config.Token);
                    request.Headers.TryAddWithoutValidation("Idempotency-Key", envelope.SignalId);
                    request.Content = new StringContent(payload, Encoding.UTF8, "application/json");
                    using var response = await _http.SendAsync(request);
                    _status.LastResponseStatus = (int)response.StatusCode;
                    _status.LastResponse = Clean(await response.Content.ReadAsStringAsync(), 500);
                    if (response.IsSuccessStatusCode)
                    {
                        File.Delete(filePath);
                        _status.LastDeliveryAt = DateTimeOffset.UtcNow.ToString("O");
                        _status.LastError = "";
                        return;
                    }
                    if (response.StatusCode is HttpStatusCode.BadRequest or HttpStatusCode.UnprocessableEntity)
                    {
                        await MoveFailedAsync(filePath, $"CartCollect rejected malformed signal ({(int)response.StatusCode}).");
                        return;
                    }
                }
                catch (HttpRequestException)
                {
                    // Another configured local port may be the active instance.
                }
                catch (TaskCanceledException)
                {
                    // A bounded retry below handles local startup latency.
                }
            }
            if (!launched)
            {
                launched = TryLaunchCartCollect();
            }
        }
        _status.State = "cartcollect-unavailable";
        _status.LastError = "CartCollect did not acknowledge a queued signal; it remains pending.";
    }

    private bool TryLaunchCartCollect()
    {
        if (string.IsNullOrWhiteSpace(_config.CartCollectExecutable)
            || !File.Exists(_config.CartCollectExecutable)
            || DateTimeOffset.UtcNow - _lastLaunchAt < TimeSpan.FromSeconds(15)) return false;
        try
        {
            Process.Start(new ProcessStartInfo(_config.CartCollectExecutable, "--background") { UseShellExecute = true });
            _lastLaunchAt = DateTimeOffset.UtcNow;
            return true;
        }
        catch
        {
            return false;
        }
    }

    private async Task MoveFailedAsync(string filePath, string reason)
    {
        var failedDirectory = string.IsNullOrWhiteSpace(_config.FailedDirectory)
            ? Path.Combine(_config.PendingDirectory, "failed")
            : _config.FailedDirectory;
        Directory.CreateDirectory(failedDirectory);
        var destination = Path.Combine(failedDirectory, Path.GetFileName(filePath));
        File.Move(filePath, destination, true);
        await File.WriteAllTextAsync($"{destination}.error.txt", Clean(reason, 500), Encoding.UTF8);
        _status.LastError = Clean(reason, 240);
    }

    private async Task RecordErrorAsync(Exception error)
    {
        _status.State = "error";
        _status.LastError = Clean(error.Message, 240);
        await WriteStatusAsync();
    }

    private async Task WriteStatusAsync()
    {
        try
        {
            _status.PendingSignals = Directory.Exists(_config.PendingDirectory)
                ? Directory.EnumerateFiles(_config.PendingDirectory, "*.json").Count()
                : 0;
            _status.UpdatedAt = DateTimeOffset.UtcNow;
            var directory = Path.GetDirectoryName(_config.StatusPath);
            if (!string.IsNullOrWhiteSpace(directory)) Directory.CreateDirectory(directory);
            var temporary = $"{_config.StatusPath}.{Environment.ProcessId}.tmp";
            await File.WriteAllTextAsync(temporary, JsonSerializer.Serialize(_status, JsonOptions), Encoding.UTF8);
            File.Move(temporary, _config.StatusPath, true);
        }
        catch
        {
            // Status reporting must never terminate notification capture.
        }
    }

    private static bool IsTrackalackerAttribution(string value)
    {
        var normalized = value.Trim().TrimEnd('/').ToLowerInvariant();
        if (normalized.StartsWith("https://")) normalized = normalized[8..];
        if (normalized.StartsWith("http://")) normalized = normalized[7..];
        if (normalized.StartsWith("www.")) normalized = normalized[4..];
        return normalized == "trackalacker.com";
    }

    private static bool IsGoogleChromeApplication(string applicationName, string applicationId)
    {
        var approvedName = applicationName.Equals("Google Chrome", StringComparison.OrdinalIgnoreCase)
            || applicationName.Equals("Google Chrome Beta", StringComparison.OrdinalIgnoreCase)
            || applicationName.Equals("Google Chrome Dev", StringComparison.OrdinalIgnoreCase)
            || applicationName.Equals("Google Chrome Canary", StringComparison.OrdinalIgnoreCase)
            || applicationName.StartsWith("Google Chrome (", StringComparison.OrdinalIgnoreCase)
                && applicationName.EndsWith(')');
        var normalizedId = applicationId.Replace('\\', '.').Replace('/', '.');
        var approvedId = normalizedId.Equals("Chrome", StringComparison.OrdinalIgnoreCase)
            || normalizedId.StartsWith("Chrome.", StringComparison.OrdinalIgnoreCase)
            || normalizedId.Equals("Google.Chrome", StringComparison.OrdinalIgnoreCase)
            || normalizedId.StartsWith("Google.Chrome.", StringComparison.OrdinalIgnoreCase);
        return approvedName || approvedId;
    }

    private static string Clean(string? value, int maximum)
    {
        if (string.IsNullOrWhiteSpace(value)) return "";
        var clean = string.Join(' ', value.Split((char[]?)null, StringSplitOptions.RemoveEmptyEntries));
        return clean.Length <= maximum ? clean : clean[..maximum];
    }

    public void Dispose()
    {
        if (_listener is not null) _listener.NotificationChanged -= NotificationChanged;
        _configWatcher.Dispose();
        _http.Dispose();
        _syncGate.Dispose();
        _deliveryGate.Dispose();
    }
}

internal static class Program
{
    private static void LaunchCartCollectAtLogin()
    {
        var appDirectory = Path.GetFullPath(Path.Combine(AppContext.BaseDirectory, "..", ".."));
        var candidates = new[] { "Cart Confirm.exe", "CartCollect.exe" };
        var executable = candidates
            .Select(name => Path.Combine(appDirectory, name))
            .FirstOrDefault(File.Exists);
        if (executable is null) return;
        Process.Start(new ProcessStartInfo(executable, "--background") { UseShellExecute = true });
    }

    [STAThread]
    private static void Main(string[] args)
    {
        var configIndex = Array.FindIndex(args, value => value.Equals("--config", StringComparison.OrdinalIgnoreCase));
        if (configIndex < 0 || configIndex + 1 >= args.Length)
        {
            LaunchCartCollectAtLogin();
            return;
        }
        var configPath = args[configIndex + 1];
        using var mutex = new Mutex(true, "Local\\CartCollect.SignalBridge", out var ownsMutex);
        if (!ownsMutex) return;

        var requestAccess = args.Any(value => value.Equals("--request-access", StringComparison.OrdinalIgnoreCase));
        var configureStartup = args.Any(value => value.Equals("--configure-startup", StringComparison.OrdinalIgnoreCase));
        var application = new Application { ShutdownMode = ShutdownMode.OnExplicitShutdown };
        BridgeHost? host = null;
        application.Startup += async (_, _) =>
        {
            try
            {
                host = new BridgeHost(configPath);
                if (configureStartup)
                {
                    await host.ReconcileStartupAsync();
                    application.Shutdown();
                    return;
                }
                if (requestAccess)
                {
                    await host.RequestAccessAsync();
                    application.Shutdown();
                    return;
                }
                await host.InitializeAsync();
            }
            catch
            {
                application.Shutdown(1);
            }
        };
        application.Exit += (_, _) => host?.Dispose();
        application.Run();
    }
}
