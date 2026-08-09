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

function nextEnabledProduct(products = [], previousProductId = "") {
  if (!Array.isArray(products) || !products.length) return null;
  const previousIndex = products.findIndex((product) => product.id === previousProductId);
  const startIndex = previousIndex >= 0 ? previousIndex : products.length - 1;
  for (let offset = 1; offset <= products.length; offset += 1) {
    const product = products[(startIndex + offset) % products.length];
    if (product?.enabled) return product;
  }
  return null;
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
  monitoringOperationActive,
  nextEnabledProduct
};
