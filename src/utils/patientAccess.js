import Slot from '../models/Slot.js';
import MedicalRecord from '../models/MedicalRecord.js';
export async function canAccessPatient(user, patientId) {
  if (user.role === 'admin') return true;
  if (user.role === 'doctor') {
    const [booking, record] = await Promise.all([
      Slot.exists({ doctorId: user._id, patientId, status: 'booked' }),
      MedicalRecord.exists({ patientId, uploadedBy: user._id, isDeleted: false })
    ]);
    return Boolean(booking || record);
  }
  if (user.role === 'diagnosis_lab_manager') return Boolean(await MedicalRecord.exists({ patientId, uploadedBy: user._id, isDeleted: false }));
  return false;
}
