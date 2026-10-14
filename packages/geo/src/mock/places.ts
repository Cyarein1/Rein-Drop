/**
 * Built-in places for the MOCK geocoder (development and tests only - refused in production).
 * Real places with approximate centre coordinates (to ~1-2 km), so distances and the map look right
 * while no Azure Maps key exists. Not a substitute for a real geocoder: TODO(geo) - production uses
 * Azure Maps (AZURE_MAPS_KEY) and falls back to free text (`none`) without it.
 *
 * [name, parent / region, ISO country, lat, lng, postal code or '', aliases separated by '|']
 */
type Row = readonly [string, string, string, number, number, string, string];

const ROWS: readonly Row[] = [
  // South Africa - Gauteng
  ['Johannesburg', 'Gauteng', 'ZA', -26.2041, 28.0473, '2001', 'joburg|jozi|jhb|egoli'],
  ['Sandton', 'Johannesburg, Gauteng', 'ZA', -26.1076, 28.0567, '2196', ''],
  ['Rosebank', 'Johannesburg, Gauteng', 'ZA', -26.1458, 28.041, '2196', ''],
  ['Randburg', 'Johannesburg, Gauteng', 'ZA', -26.0936, 28.0064, '2194', ''],
  ['Fourways', 'Johannesburg, Gauteng', 'ZA', -26.0107, 28.0068, '2191', ''],
  ['Roodepoort', 'Johannesburg, Gauteng', 'ZA', -26.1625, 27.8725, '1724', ''],
  ['Soweto', 'Johannesburg, Gauteng', 'ZA', -26.2485, 27.854, '1804', ''],
  ['Midrand', 'Johannesburg, Gauteng', 'ZA', -25.9992, 28.1263, '1685', ''],
  ['Kempton Park', 'Ekurhuleni, Gauteng', 'ZA', -26.1003, 28.2311, '1619', ''],
  ['Benoni', 'Ekurhuleni, Gauteng', 'ZA', -26.1885, 28.3208, '1501', ''],
  ['Boksburg', 'Ekurhuleni, Gauteng', 'ZA', -26.2125, 28.2625, '1459', ''],
  ['Germiston', 'Ekurhuleni, Gauteng', 'ZA', -26.2178, 28.1672, '1401', ''],
  ['Vereeniging', 'Gauteng', 'ZA', -26.6731, 27.9261, '1930', ''],
  ['Pretoria', 'Gauteng', 'ZA', -25.7479, 28.2293, '0002', 'tshwane|pta'],
  ['Centurion', 'Pretoria, Gauteng', 'ZA', -25.8603, 28.1894, '0157', ''],
  ['Hatfield', 'Pretoria, Gauteng', 'ZA', -25.7487, 28.238, '0083', ''],
  // South Africa - Western Cape
  ['Cape Town', 'Western Cape', 'ZA', -33.9249, 18.4241, '8001', 'kaapstad|cpt'],
  ['Sea Point', 'Cape Town, Western Cape', 'ZA', -33.9156, 18.3889, '8005', ''],
  ['Claremont', 'Cape Town, Western Cape', 'ZA', -33.9806, 18.4653, '7708', ''],
  ['Bellville', 'Cape Town, Western Cape', 'ZA', -33.8995, 18.6292, '7530', ''],
  ['Durbanville', 'Cape Town, Western Cape', 'ZA', -33.8323, 18.6472, '7550', ''],
  ['Somerset West', 'Cape Town, Western Cape', 'ZA', -34.0757, 18.8433, '7130', ''],
  ['Stellenbosch', 'Western Cape', 'ZA', -33.9321, 18.8602, '7600', ''],
  ['Paarl', 'Western Cape', 'ZA', -33.7342, 18.9622, '7646', ''],
  ['George', 'Western Cape', 'ZA', -33.963, 22.4617, '6529', ''],
  // South Africa - other provinces
  ['Durban', 'KwaZulu-Natal', 'ZA', -29.8587, 31.0218, '4001', 'ethekwini|dbn'],
  ['Umhlanga', 'Durban, KwaZulu-Natal', 'ZA', -29.7266, 31.087, '4319', 'umhlanga rocks'],
  ['Pinetown', 'Durban, KwaZulu-Natal', 'ZA', -29.8156, 30.8578, '3610', ''],
  ['Pietermaritzburg', 'KwaZulu-Natal', 'ZA', -29.6006, 30.3794, '3201', 'pmb'],
  ['Gqeberha', 'Eastern Cape', 'ZA', -33.9608, 25.6022, '6001', 'port elizabeth|pe'],
  ['East London', 'Eastern Cape', 'ZA', -33.0153, 27.9116, '5201', ''],
  ['Bloemfontein', 'Free State', 'ZA', -29.0852, 26.1596, '9301', 'mangaung'],
  ['Polokwane', 'Limpopo', 'ZA', -23.9045, 29.4689, '0700', 'pietersburg'],
  ['Mbombela', 'Mpumalanga', 'ZA', -25.4658, 30.9853, '1200', 'nelspruit'],
  ['Kimberley', 'Northern Cape', 'ZA', -28.7282, 24.7499, '8301', ''],
  ['Rustenburg', 'North West', 'ZA', -25.6676, 27.2421, '0299', ''],
  ['Potchefstroom', 'North West', 'ZA', -26.7145, 27.097, '2531', ''],
  // Neighbours
  ['Windhoek', 'Khomas', 'NA', -22.5609, 17.0658, '', ''],
  ['Gaborone', 'South-East', 'BW', -24.6282, 25.9231, '', ''],
  // United States
  ['New York', 'NY', 'US', 40.7128, -74.006, '10001', 'nyc|manhattan'],
  ['Brooklyn', 'NY', 'US', 40.6782, -73.9442, '11201', ''],
  ['Philadelphia', 'PA', 'US', 39.9526, -75.1652, '19107', 'philly'],
  ['Boston', 'MA', 'US', 42.3601, -71.0589, '02108', ''],
  ['Chicago', 'IL', 'US', 41.8781, -87.6298, '60601', ''],
  ['Atlanta', 'GA', 'US', 33.749, -84.388, '30303', ''],
  ['Miami', 'FL', 'US', 25.7617, -80.1918, '33130', ''],
  ['Houston', 'TX', 'US', 29.7604, -95.3698, '77002', ''],
  ['Austin', 'TX', 'US', 30.2672, -97.7431, '78701', ''],
  ['Dallas', 'TX', 'US', 32.7767, -96.797, '75201', ''],
  ['Denver', 'CO', 'US', 39.7392, -104.9903, '80202', ''],
  ['Phoenix', 'AZ', 'US', 33.4484, -112.074, '85004', ''],
  ['Los Angeles', 'CA', 'US', 34.0522, -118.2437, '90012', 'la'],
  ['San Diego', 'CA', 'US', 32.7157, -117.1611, '92101', ''],
  ['San Francisco', 'CA', 'US', 37.7749, -122.4194, '94103', 'sf'],
  ['Seattle', 'WA', 'US', 47.6062, -122.3321, '98101', ''],
  // United Kingdom and Ireland
  ['London', 'England', 'GB', 51.5074, -0.1278, 'WC2N', ''],
  ['Birmingham', 'England', 'GB', 52.4862, -1.8904, 'B1', ''],
  ['Manchester', 'England', 'GB', 53.4808, -2.2426, 'M1', ''],
  ['Liverpool', 'England', 'GB', 53.4084, -2.9916, 'L1', ''],
  ['Leeds', 'England', 'GB', 53.8008, -1.5491, 'LS1', ''],
  ['Bristol', 'England', 'GB', 51.4545, -2.5879, 'BS1', ''],
  ['Glasgow', 'Scotland', 'GB', 55.8642, -4.2518, 'G1', ''],
  ['Edinburgh', 'Scotland', 'GB', 55.9533, -3.1883, 'EH1', ''],
  ['Dublin', 'Leinster', 'IE', 53.3498, -6.2603, '', ''],
  // Elsewhere
  ['Toronto', 'ON', 'CA', 43.6532, -79.3832, '', ''],
  ['Vancouver', 'BC', 'CA', 49.2827, -123.1207, '', ''],
  ['Sydney', 'NSW', 'AU', -33.8688, 151.2093, '2000', ''],
  ['Melbourne', 'VIC', 'AU', -37.8136, 144.9631, '3000', ''],
  ['Berlin', 'Berlin', 'DE', 52.52, 13.405, '10115', ''],
  ['Lagos', 'Lagos State', 'NG', 6.5244, 3.3792, '', ''],
  ['Nairobi', 'Nairobi County', 'KE', -1.2921, 36.8219, '', ''],
];

export interface MockPlace {
  name: string;
  parent: string;
  countryCode: string;
  lat: number;
  lng: number;
  postalCode: string | null;
  aliases: string[];
}

export const MOCK_PLACES: readonly MockPlace[] = ROWS.map(([name, parent, countryCode, lat, lng, postal, aliases]) => ({
  name,
  parent,
  countryCode,
  lat,
  lng,
  postalCode: postal || null,
  aliases: aliases ? aliases.split('|') : [],
}));
