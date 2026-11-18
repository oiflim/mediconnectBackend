export function medicineAvailabilityStatus(medicine, now = new Date()) {
  if (!medicine.isActive) return 'INACTIVE';
  if (medicine.expiryDate && new Date(medicine.expiryDate) < now) return 'EXPIRED';
  if (medicine.quantity <= 0) return 'OUT_OF_STOCK';
  if (medicine.quantity <= medicine.reorderLevel) return 'LOW_STOCK';
  return 'AVAILABLE';
}
