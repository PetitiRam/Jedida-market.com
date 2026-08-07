// A practical subset covering JEDIDA's primary markets plus major global
// codes. Extend freely — shape is [name, ISO2, dialCode].
export const COUNTRIES = [
  ['Uganda', 'UG', '+256'],
  ['Kenya', 'KE', '+254'],
  ['Tanzania', 'TZ', '+255'],
  ['Rwanda', 'RW', '+250'],
  ['Burundi', 'BI', '+257'],
  ['South Sudan', 'SS', '+211'],
  ['Democratic Republic of Congo', 'CD', '+243'],
  ['Nigeria', 'NG', '+234'],
  ['Ghana', 'GH', '+233'],
  ['South Africa', 'ZA', '+27'],
  ['Ethiopia', 'ET', '+251'],
  ['Egypt', 'EG', '+20'],
  ['United States', 'US', '+1'],
  ['United Kingdom', 'GB', '+44'],
  ['Canada', 'CA', '+1'],
  ['India', 'IN', '+91'],
  ['United Arab Emirates', 'AE', '+971'],
  ['China', 'CN', '+86']
].map(([name, iso2, dialCode]) => ({ name, iso2, dialCode, flag: isoToFlag(iso2) }));

function isoToFlag(iso2) {
  return iso2
    .toUpperCase()
    .replace(/./g, (c) => String.fromCodePoint(127397 + c.charCodeAt(0)));
}

export const CITIES_BY_COUNTRY = {
  UG: ['Kampala', 'Entebbe', 'Jinja', 'Mbarara', 'Gulu', 'Mbale'],
  KE: ['Nairobi', 'Mombasa', 'Kisumu', 'Nakuru', 'Eldoret'],
  TZ: ['Dar es Salaam', 'Dodoma', 'Arusha', 'Mwanza'],
  RW: ['Kigali', 'Butare', 'Gisenyi'],
  NG: ['Lagos', 'Abuja', 'Kano', 'Ibadan'],
  GH: ['Accra', 'Kumasi', 'Tamale'],
  ZA: ['Johannesburg', 'Cape Town', 'Durban', 'Pretoria'],
  US: ['New York', 'Los Angeles', 'Chicago', 'Houston'],
  GB: ['London', 'Manchester', 'Birmingham']
};
