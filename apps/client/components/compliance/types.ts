export interface MedicalVisaCompliance {
  id: string;
  playerId: string;
  type: 'VISA' | 'MEDICAL';
  status: 'VALID' | 'EXPIRED' | 'EXPIRING_SOON';
  expiryDate: string; // ISO String
  lastUpdated: string;
  documents: string[];
}

export interface PlayerComplianceSummary {
  playerId: string;
  firstName: string;
  lastName: string;
  avatarUrl: string;
  position: string;
  jerseyNumber: string;
  visaStatus: MedicalVisaCompliance;
  medicalClearance: MedicalVisaCompliance;
}

export interface AppointmentPayload {
  teamId: string;
  date: string;
  location: string;
  isEntireTeam: boolean;
  selectedPlayerIds?: string[];
  type: 'VISA_RENEWAL' | 'MEDICAL_CHECK';
}
