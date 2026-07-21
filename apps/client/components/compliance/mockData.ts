import { PlayerComplianceSummary } from './types';

// Mock types representing the data models defined in the plan
export const MOCK_PLAYERS: PlayerComplianceSummary[] = [
  {
    playerId: "p1",
    firstName: "Marcus",
    lastName: "Sterling",
    avatarUrl: "https://i.pravatar.cc/150?img=11",
    position: "Point Guard",
    jerseyNumber: "#12",
    visaStatus: {
      id: "v1",
      playerId: "p1",
      type: "VISA",
      status: "EXPIRED",
      expiryDate: "2023-10-12T00:00:00Z", // Oct 12, 2023
      lastUpdated: new Date().toISOString(),
      documents: []
    },
    medicalClearance: {
      id: "m1",
      playerId: "p1",
      type: "MEDICAL",
      status: "VALID",
      expiryDate: "2025-10-12T00:00:00Z",
      lastUpdated: new Date().toISOString(),
      documents: []
    }
  },
  {
    playerId: "p2",
    firstName: "Luka",
    lastName: "Modric",
    avatarUrl: "https://i.pravatar.cc/150?img=12",
    position: "Midfield",
    jerseyNumber: "#10",
    visaStatus: {
      id: "v2",
      playerId: "p2",
      type: "VISA",
      status: "EXPIRING_SOON",
      expiryDate: "2024-11-28T00:00:00Z", // Nov 28, 2024
      lastUpdated: new Date().toISOString(),
      documents: []
    },
    medicalClearance: {
      id: "m2",
      playerId: "p2",
      type: "MEDICAL",
      status: "VALID",
      expiryDate: "2025-11-28T00:00:00Z",
      lastUpdated: new Date().toISOString(),
      documents: []
    }
  },
  {
    playerId: "p3",
    firstName: "Andre",
    lastName: "Onana",
    avatarUrl: "https://i.pravatar.cc/150?img=13",
    position: "Goalkeeper",
    jerseyNumber: "#24",
    visaStatus: {
      id: "v3",
      playerId: "p3",
      type: "VISA",
      status: "VALID",
      expiryDate: "2026-08-15T00:00:00Z", // Aug 15, 2026
      lastUpdated: new Date().toISOString(),
      documents: []
    },
    medicalClearance: {
      id: "m3",
      playerId: "p3",
      type: "MEDICAL",
      status: "EXPIRED", // Indicates Update Needed
      expiryDate: "2023-01-01T00:00:00Z",
      lastUpdated: new Date().toISOString(),
      documents: []
    }
  },
  {
    playerId: "p4",
    firstName: "Sarah",
    lastName: "Jenkins",
    avatarUrl: "https://i.pravatar.cc/150?img=5",
    position: "Forward",
    jerseyNumber: "#07",
    visaStatus: {
      id: "v4",
      playerId: "p4",
      type: "VISA",
      status: "VALID",
      expiryDate: "2027-01-10T00:00:00Z", // Jan 10, 2027
      lastUpdated: new Date().toISOString(),
      documents: []
    },
    medicalClearance: {
      id: "m4",
      playerId: "p4",
      type: "MEDICAL",
      status: "VALID",
      expiryDate: "2027-01-10T00:00:00Z",
      lastUpdated: new Date().toISOString(),
      documents: []
    }
  }
];
