import { describe, it, expect } from 'vitest';
import {
  canChangeStatus, canRelease, resolveClaim, parseLocation, deliveryPinError,
} from '../server/lib/orderRules.js';

const customer = { role: 'customer', id: 10 };
const driver = { role: 'driver', id: 20 };
const kitchen = { role: 'kitchen', id: 30 };
const manager = { role: 'manager', id: 40 };
const order = (over = {}) => ({ status: 'pending', customerUserId: 10, driverUserId: null, ...over });

describe('canChangeStatus', () => {
  it('never allows setting out_for_delivery directly', () => {
    expect(canChangeStatus(manager, order({ status: 'ready' }), 'out_for_delivery')).toMatchObject({ ok: false, code: 400 });
  });
  it('keeps cancelled terminal', () => {
    expect(canChangeStatus(manager, order({ status: 'cancelled' }), 'pending')).toMatchObject({ ok: false, code: 409 });
  });
  it('lets a customer cancel their own pending order only', () => {
    expect(canChangeStatus(customer, order(), 'cancelled')).toEqual({ ok: true });
    expect(canChangeStatus(customer, order({ status: 'preparing' }), 'cancelled')).toMatchObject({ ok: false, code: 409 });
    expect(canChangeStatus(customer, order({ status: 'out_for_delivery' }), 'cancelled')).toMatchObject({ ok: false, code: 409 });
    expect(canChangeStatus(customer, order({ customerUserId: 11 }), 'cancelled')).toMatchObject({ ok: false, code: 403 });
    expect(canChangeStatus(customer, order(), 'completed')).toMatchObject({ ok: false, code: 403 });
  });
  it('lets a driver complete only their own out_for_delivery order', () => {
    const mine = order({ status: 'out_for_delivery', driverUserId: 20 });
    expect(canChangeStatus(driver, mine, 'completed')).toEqual({ ok: true });
    expect(canChangeStatus(driver, mine, 'cancelled')).toMatchObject({ ok: false, code: 403 });
    expect(canChangeStatus(driver, { ...mine, driverUserId: 21 }, 'completed')).toMatchObject({ ok: false, code: 403 });
    expect(canChangeStatus(driver, order({ status: 'ready' }), 'completed')).toMatchObject({ ok: false, code: 403 });
  });
  it('limits out_for_delivery to completed or cancelled for staff', () => {
    const out = order({ status: 'out_for_delivery', driverUserId: 20 });
    expect(canChangeStatus(kitchen, out, 'completed')).toEqual({ ok: true });
    expect(canChangeStatus(kitchen, out, 'cancelled')).toEqual({ ok: true });
    expect(canChangeStatus(kitchen, out, 'ready')).toMatchObject({ ok: false, code: 400 });
  });
  it('lets staff make ordinary kitchen transitions', () => {
    expect(canChangeStatus(kitchen, order(), 'preparing')).toEqual({ ok: true });
    expect(canChangeStatus(manager, order({ status: 'ready' }), 'completed')).toEqual({ ok: true });
  });
  it('lets a manager complete a delivery they are carrying', () => {
    expect(canChangeStatus(manager, order({ status: 'out_for_delivery', driverUserId: 40 }), 'completed')).toEqual({ ok: true });
  });
  it('rejects unknown roles', () => {
    expect(canChangeStatus({ role: 'guest', id: 1 }, order(), 'cancelled')).toMatchObject({ ok: false, code: 403 });
  });
});

describe('canRelease', () => {
  it('allows only the assigned driver while out for delivery', () => {
    expect(canRelease(driver, { status: 'out_for_delivery', driverUserId: 20 })).toEqual({ ok: true });
    expect(canRelease(driver, { status: 'out_for_delivery', driverUserId: 21 })).toMatchObject({ ok: false, code: 403 });
    expect(canRelease(manager, { status: 'out_for_delivery', driverUserId: 20 })).toMatchObject({ ok: false, code: 403 });
    expect(canRelease(driver, { status: 'completed', driverUserId: 20 })).toMatchObject({ ok: false, code: 409 });
  });
});

describe('resolveClaim', () => {
  it('self-claims for drivers, managers and admins with an empty body', () => {
    expect(resolveClaim(driver, {})).toEqual({ ok: true, driverUserId: 20, self: true });
    expect(resolveClaim(manager, undefined)).toEqual({ ok: true, driverUserId: 40, self: true });
    expect(resolveClaim({ role: 'admin', id: 50 }, {})).toEqual({ ok: true, driverUserId: 50, self: true });
  });
  it('requires kitchen and cashier to pick a driver', () => {
    expect(resolveClaim(kitchen, {})).toMatchObject({ ok: false, code: 400 });
    expect(resolveClaim(kitchen, { driverUserId: 20 })).toEqual({ ok: true, driverUserId: 20, self: false });
    expect(resolveClaim({ role: 'cashier', id: 31 }, { driverUserId: 20 })).toEqual({ ok: true, driverUserId: 20, self: false });
  });
  it('stops a driver claiming for someone else', () => {
    expect(resolveClaim(driver, { driverUserId: 21 })).toMatchObject({ ok: false, code: 403 });
    expect(resolveClaim(driver, { driverUserId: 20 })).toEqual({ ok: true, driverUserId: 20, self: true });
  });
  it('treats a manager naming themselves as a self-claim', () => {
    expect(resolveClaim(manager, { driverUserId: 40 })).toEqual({ ok: true, driverUserId: 40, self: true });
  });
  it('rejects customers and bad ids', () => {
    expect(resolveClaim(customer, {})).toMatchObject({ ok: false, code: 403 });
    expect(resolveClaim(kitchen, { driverUserId: '20' })).toMatchObject({ ok: false, code: 400 });
    expect(resolveClaim(kitchen, { driverUserId: 0 })).toMatchObject({ ok: false, code: 400 });
  });
});

describe('parseLocation', () => {
  it('accepts finite in-range numbers', () => {
    expect(parseLocation({ lat: 40.7, lng: -74 })).toEqual({ ok: true, lat: 40.7, lng: -74 });
    expect(parseLocation({ lat: 0, lng: 0 })).toEqual({ ok: true, lat: 0, lng: 0 });
  });
  it('rejects strings, NaN, missing and out-of-range values', () => {
    for (const body of [
      { lat: '40', lng: -74 }, { lat: NaN, lng: -74 }, { lat: 40 }, null,
      { lat: 91, lng: 0 }, { lat: 0, lng: -181 }, { lat: Infinity, lng: 0 },
    ]) {
      expect(parseLocation(body)).toMatchObject({ ok: false, code: 400 });
    }
  });
});

describe('deliveryPinError', () => {
  it('requires both coordinates for delivery only', () => {
    expect(deliveryPinError('delivery', 40, -74)).toBeNull();
    expect(deliveryPinError('delivery', null, -74)).toMatch(/location/i);
    expect(deliveryPinError('delivery', null, null)).toMatch(/location/i);
    expect(deliveryPinError('pickup', null, null)).toBeNull();
    expect(deliveryPinError(undefined, null, null)).toBeNull();
  });
});
