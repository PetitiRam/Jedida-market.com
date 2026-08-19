export const PAYMENT_METHODS = [
  {
    id: "pesajet",
    label: "Mobile Money (PesaJet)",
    network: "MTN / Airtel",
    logo: "/payment-logos/mtn.png",
    available: true
  },

  {
    id: "cash_on_delivery",
    label: "Cash on Delivery",
    logo: "/payment-logos/mobile-banking.png",
    available: true
  },

  {
  id:"mtn_mobile_money",
    label: 'MTN Mobile Money',
    network: 'MTN',
    logo: '/payment-logos/mtn.png',
    available: true
  },
                       
  {
    id: "airtel_money",
    label: 'Airtel Money',
    network: 'Airtel',
    logo: '/payment-logos/airtel.svg',
    available: true
  },

  {
    id: 'card',
    label: 'Visa / Mastercard',
    logo: '/payment-logos/stripe.png',
    available: false
  },

  {
    id: 'paypal',
    label: 'PayPal',
    logo: '/payment-logos/paypal.png',
    available: false
  },

{
  id: 'bank',
  label: 'Bank Transfer',
  logo: '/payment-logos/mobile-banking.png',
  available: false
},

{
  id: 'crypto',
  label: 'Cryptocurrency',
  logo: '/payment-logos/bitcoin.png',
  available: false
}
];

