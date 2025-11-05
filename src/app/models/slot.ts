export interface Slot {
  id: string;                 // Unique slot identifier
  startTime: string;           // ISO timestamp, e.g., "2025-10-23T14:00:00Z"
  endTime: string;             // ISO timestamp
  status: 'available' | 'booked' | 'blocked' | 'cancelled';  // Slot state
  bookingId?: string;          // ID of booking, if slot is booked
  version?: number;            // For concurrency control (optional)
  updatedAt?: string;          // Last updated timestamp (optional)
  timezone?: string;           // Timezone of the slot or owner (e.g., "America/Toronto")
  recurrenceRuleId?: string;   // For recurring slots (optional)
}