export const NIGERIAN_STATES = [
  'Abia', 'Adamawa', 'Akwa Ibom', 'Anambra', 'Bauchi', 'Bayelsa', 'Benue', 'Borno',
  'Cross River', 'Delta', 'Ebonyi', 'Edo', 'Ekiti', 'Enugu', 'FCT Abuja', 'Gombe',
  'Imo', 'Jigawa', 'Kaduna', 'Kano', 'Katsina', 'Kebbi', 'Kogi', 'Kwara', 'Lagos',
  'Nasarawa', 'Niger', 'Ogun', 'Ondo', 'Osun', 'Oyo', 'Plateau', 'Rivers', 'Sokoto',
  'Taraba', 'Yobe', 'Zamfara',
];

export const NIGERIAN_CITIES_BY_STATE = {
  Abia: ['Aba', 'Umuahia', 'Ohafia', 'Arochukwu'],
  Adamawa: ['Yola', 'Jimeta', 'Mubi', 'Numan'],
  'Akwa Ibom': ['Uyo', 'Eket', 'Ikot Ekpene', 'Oron'],
  Anambra: ['Awka', 'Onitsha', 'Nnewi', 'Ekwulobia'],
  Bauchi: ['Bauchi', 'Azare', 'Misau', 'Jama’are'],
  Bayelsa: ['Yenagoa', 'Brass', 'Ogbia', 'Nembe'],
  Benue: ['Makurdi', 'Gboko', 'Otukpo', 'Katsina-Ala'],
  Borno: ['Maiduguri', 'Biu', 'Dikwa', 'Bama'],
  'Cross River': ['Calabar', 'Ogoja', 'Ikom', 'Ugep'],
  Delta: ['Asaba', 'Warri', 'Effurun', 'Sapele'],
  Ebonyi: ['Abakaliki', 'Afikpo', 'Onueke', 'Ezza'],
  Edo: ['Benin City', 'Auchi', 'Ekpoma', 'Uromi'],
  Ekiti: ['Ado-Ekiti', 'Ikere-Ekiti', 'Ijero-Ekiti', 'Ikole-Ekiti'],
  Enugu: ['Enugu', 'Nsukka', 'Oji River', 'Agbani'],
  'FCT Abuja': ['Abuja', 'Garki', 'Wuse', 'Maitama', 'Kubwa', 'Gwagwalada', 'Kuje', 'Bwari'],
  Gombe: ['Gombe', 'Kumo', 'Deba', 'Billiri'],
  Imo: ['Owerri', 'Orlu', 'Okigwe', 'Mbaise'],
  Jigawa: ['Dutse', 'Hadejia', 'Kazaure', 'Gumel'],
  Kaduna: ['Kaduna', 'Zaria', 'Kafanchan', 'Kachia'],
  Kano: ['Kano', 'Wudil', 'Gaya', 'Bichi'],
  Katsina: ['Katsina', 'Daura', 'Funtua', 'Malumfashi'],
  Kebbi: ['Birnin Kebbi', 'Argungu', 'Yauri', 'Zuru'],
  Kogi: ['Lokoja', 'Okene', 'Kabba', 'Idah'],
  Kwara: ['Ilorin', 'Offa', 'Lafiagi', 'Jebba'],
  Lagos: ['Ikeja', 'Lagos Island', 'Lekki', 'Surulere', 'Epe', 'Badagry', 'Ikorodu'],
  Nasarawa: ['Lafia', 'Keffi', 'Karu', 'Akwanga'],
  Niger: ['Minna', 'Suleja', 'Bida', 'Kontagora'],
  Ogun: ['Abeokuta', 'Ijebu-Ode', 'Sagamu', 'Ota'],
  Ondo: ['Akure', 'Ondo', 'Owo', 'Ikare-Akoko'],
  Osun: ['Osogbo', 'Ile-Ife', 'Ilesa', 'Ede'],
  Oyo: ['Ibadan', 'Ogbomoso', 'Oyo', 'Iseyin'],
  Plateau: ['Jos', 'Bukuru', 'Pankshin', 'Shendam'],
  Rivers: ['Port Harcourt', 'Obio-Akpor', 'Bonny', 'Eleme'],
  Sokoto: ['Sokoto', 'Tambuwal', 'Gwadabawa', 'Wurno'],
  Taraba: ['Jalingo', 'Wukari', 'Bali', 'Gembu'],
  Yobe: ['Damaturu', 'Potiskum', 'Gashua', 'Nguru'],
  Zamfara: ['Gusau', 'Kaura Namoda', 'Talata Mafara', 'Anka'],
};

export function getCitiesForState(state, availableCities = []) {
  const known = NIGERIAN_CITIES_BY_STATE[state] || [];
  return [...new Set([...known, ...availableCities].filter(Boolean))]
    .sort((a, b) => a.localeCompare(b));
}
