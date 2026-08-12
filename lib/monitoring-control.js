"use strict";

function monitoringActive(settings = {}) {
  return Boolean(settings.automationEnabled) && settings.monitoringPaused !== true;
}

function monitoringOperationActive(settings, operationEpoch, currentEpoch) {
  return operationEpoch === currentEpoch && monitoringActive(settings);
}

function companionEventAllowed(settings = {}, eventType = "") {
  return eventType === "heartbeat" || settings.monitoringPaused !== true;
}

function createAbortRegistry() {
  const controllers = new Set();
  return {
    create() {
      const controller = new AbortController();
      controllers.add(controller);
      return controller;
    },
    release(controller) {
      controllers.delete(controller);
    },
    abortAll() {
      for (const controller of controllers) controller.abort();
      controllers.clear();
    },
    size() {
      return controllers.size;
    }
  };
}

module.exports = {
  companionEventAllowed,
  createAbortRegistry,
  monitoringActive,
  monitoringOperationActive
};
