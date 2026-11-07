import { SunMedium, Zap, BatteryFull, Plug, Lightbulb, Droplets, Cable, Boxes, Wind, Wrench, Settings2, Leaf } from 'lucide-react';
export { NIGERIAN_STATES } from './nigerianLocations.js';

// Category icons are matched to the category slugs served by the API.
export const CATEGORIES = [
  { slug: 'solar-panels', name: 'Solar Panels', icon: SunMedium },
  { slug: 'solar-inverters', name: 'Solar Inverters', icon: Zap },
  { slug: 'solar-batteries', name: 'Solar Batteries', icon: BatteryFull },
  { slug: 'solar-generators', name: 'Solar Generators', icon: Plug },
  { slug: 'solar-street-lights', name: 'Solar Street Lights', icon: Lightbulb },
  { slug: 'solar-water-pumps', name: 'Solar Water Pumps', icon: Droplets },
  { slug: 'solar-accessories', name: 'Solar Accessories', icon: Cable },
  { slug: 'energy-storage-systems', name: 'Energy Storage Systems', icon: Boxes },
  { slug: 'wind-energy-equipment', name: 'Wind Energy Equipment', icon: Wind },
  { slug: 'solar-installation-services', name: 'Solar Installation Services', icon: Wrench },
  { slug: 'solar-maintenance-repairs', name: 'Solar Maintenance and Repairs', icon: Settings2 },
  { slug: 'other-renewable-energy', name: 'Other Renewable Energy Products', icon: Leaf },
];
