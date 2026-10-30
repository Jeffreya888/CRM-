import assert from 'node:assert/strict';
import { test } from 'node:test';
import { classifyVehicle, isValidVin, normalizeVin, parseNhtsa, tidyMake } from './vin';

test('VIN check digit', () => {
  assert.equal(isValidVin('1HGCM82633A004352'), true, 'Honda Accord sample');
  assert.equal(isValidVin('1hgcm82633a004352'), true, 'lower case is fine');
  assert.equal(isValidVin('1HGCM82633A004353'), false, 'wrong last digit changes the check');
  assert.equal(isValidVin('1HGCM8263'), false, 'too short');
  assert.equal(isValidVin('1HGCM82O33A004352'), false, 'letter O is never used');
  assert.equal(normalizeVin(' 1hg-cm8 '), '1HGCM8');
});

test('size class from the decoded vehicle', () => {
  const c = (make: string, model: string, body: string, type = 'PASSENGER CAR', gvwr: string | null = null) =>
    classifyVehicle({ make, model, body_class: body, vehicle_type: type, gvwr });
  assert.equal(c('HONDA', 'Accord', 'Sedan/Saloon'), 'car');
  assert.equal(c('MAZDA', 'MX-5', 'Convertible/Cabriolet'), 'compact');
  assert.equal(c('TOYOTA', 'RAV4', 'Sport Utility Vehicle (SUV)/Multi-Purpose Vehicle (MPV)', 'MULTIPURPOSE PASSENGER VEHICLE (MPV)'), 'suv');
  assert.equal(c('CHEVROLET', 'Tahoe', 'Sport Utility Vehicle (SUV)/Multi-Purpose Vehicle (MPV)', 'MULTIPURPOSE PASSENGER VEHICLE (MPV)'), 'suv_full');
  assert.equal(c('BUICK', 'Encore', 'Crossover Utility Vehicle (CUV)', 'MULTIPURPOSE PASSENGER VEHICLE (MPV)'), 'crossover');
  assert.equal(c('FORD', 'F-150', 'Pickup', 'TRUCK', 'Class 2E: 6,001 - 7,000 lb'), 'truck');
  assert.equal(c('FORD', 'F-250', 'Pickup', 'TRUCK', 'Class 2H: 8,501 - 10,000 lb'), 'truck_hd');
  assert.equal(c('RAM', '3500', 'Pickup', 'TRUCK'), 'truck_hd');
  assert.equal(c('TOYOTA', 'Tacoma', 'Pickup', 'TRUCK', 'Class 1D: 5,001 - 6,000 lb'), 'truck_mid');
  assert.equal(c('HONDA', 'Odyssey', 'Minivan', 'MULTIPURPOSE PASSENGER VEHICLE (MPV)'), 'van');
  assert.equal(c('MERCEDES-BENZ', 'Sprinter', 'Van', 'TRUCK'), 'van');
  assert.equal(c('FERRARI', 'Roma', 'Coupe'), 'exotic');
  assert.equal(c('PORSCHE', '911', 'Coupe'), 'exotic');
  assert.equal(c('HARLEY-DAVIDSON', 'FLHX', 'Motorcycle - Touring / Sport Touring', 'MOTORCYCLE'), 'motorcycle');
  assert.equal(c('WINNEBAGO', 'View', 'Motorhome', 'INCOMPLETE VEHICLE'), 'rv');
});

test('NHTSA reply parsing', () => {
  const d = parseNhtsa({ Results: [{ Make: 'TOYOTA', Model: 'RAV4', ModelYear: '2022', Trim: 'XLE', BodyClass: 'Sport Utility Vehicle (SUV)/Multi-Purpose Vehicle (MPV)', VehicleType: 'MULTIPURPOSE PASSENGER VEHICLE (MPV)', GVWR: 'Not Applicable', Series: '' }] });
  assert.deepEqual(d, { make: 'TOYOTA', model: 'RAV4', year: 2022, trim: 'XLE', body_class: 'Sport Utility Vehicle (SUV)/Multi-Purpose Vehicle (MPV)', vehicle_type: 'MULTIPURPOSE PASSENGER VEHICLE (MPV)', gvwr: null, series: null });
  assert.equal(parseNhtsa({ Results: [{ Make: '', Model: '' }] }), null);
  assert.equal(parseNhtsa({}), null);
  assert.equal(tidyMake('TOYOTA'), 'Toyota');
  assert.equal(tidyMake('MERCEDES-BENZ'), 'Mercedes-Benz');
  assert.equal(tidyMake('BMW'), 'BMW');
  assert.equal(tidyMake('GMC'), 'GMC');
});
