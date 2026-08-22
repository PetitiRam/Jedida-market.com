// Adapter architecture for the Logistics Hub (master brief section 23:
// "Create an adapter/provider architecture. Do not hard-code one
// shipping company."). Every shipping_providers row has an
// integration_type of 'manual' or 'api'; getAdapterForProvider()
// returns the matching adapter so calling code never branches on
// provider identity.
//
// Today every real provider is 'manual' — no freight/courier API
// credentials exist for this project, so quoting and status updates go
// through an admin/provider rep typing them into the Logistics Hub
// panels (see logisticsHubController.js). That is a legitimate,
// working mode, not a stub: manualAdapter below is fully implemented.
//
// apiAdapter is the extension seam for when a real courier/freight API
// is integrated later. It intentionally throws NOT_IMPLEMENTED instead
// of fabricating request/response shapes for an undocumented endpoint —
// wiring it up is "write one adapter file using that provider's actual
// documented API", not a change anywhere else in the codebase.

export const manualAdapter = {
  // A manual provider has no live rate API — quotes are rate options an
  // admin/provider rep enters directly into shipping_quote_options.
  // This function exists so calling code has one consistent shape to
  // call regardless of provider, even though there's nothing to fetch.
  async getQuote() {
    return { supported: false, reason: 'This provider quotes manually — enter a rate in the Logistics Hub admin panel.' };
  },
  async createBooking() {
    return { supported: false, reason: 'This provider is booked manually — record the booking directly.' };
  },
  async trackShipment() {
    return { supported: false, reason: 'This provider is tracked via manual status updates.' };
  }
};

export const apiAdapter = {
  async getQuote() {
    throw new Error('NOT_IMPLEMENTED: wire this provider\'s documented rate API before switching integration_type to "api".');
  },
  async createBooking() {
    throw new Error('NOT_IMPLEMENTED: wire this provider\'s documented booking API before switching integration_type to "api".');
  },
  async trackShipment() {
    throw new Error('NOT_IMPLEMENTED: wire this provider\'s documented tracking API before switching integration_type to "api".');
  }
};

export function getAdapterForProvider(provider) {
  return provider?.integration_type === 'api' ? apiAdapter : manualAdapter;
}
