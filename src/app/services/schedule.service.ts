import { Injectable } from '@angular/core';
import { getFirestore, collection, query, where, getDocs, addDoc, updateDoc, doc } from 'firebase/firestore';

export type ClassDoc = {
  id?: string;
  studentId?: string;
  teacherId: string;
  startTimeUtc: string; // ISO
  endTimeUtc: string;   // ISO
  status?: 'scheduled' | 'cancelled' | 'blocked';
  createdAt?: number;
  updatedAt?: number;
};

@Injectable({ providedIn: 'root' })
export class ScheduleService {
  private db = getFirestore();

  // fetch classes that overlap [from,to) for a teacher
  async getClasses(teacherId: string, fromIso: string, toIso: string): Promise<ClassDoc[]> {
    const classesRef = collection(this.db, 'classes');
    // Firestore can't express overlap directly in single query reliably for all cases;
    // fetch classes with start < to and filter where end > from
    const q = query(classesRef, where('teacherId', '==', teacherId), where('startTimeUtc', '<', toIso));
    const snap = await getDocs(q);
    const docs = snap.docs.map(d => ({ id: d.id, ...(d.data() as any) })) as ClassDoc[];
    return docs.filter(c => (c.endTimeUtc ?? '') > fromIso && c.status !== 'cancelled');
  }

  async createClass(payload: ClassDoc) {
    await addDoc(collection(this.db, 'classes'), {
      ...payload,
      status: 'scheduled',
      createdAt: Date.now()
    });
  }

  async updateClass(id: string, patch: Partial<ClassDoc>) {
    await updateDoc(doc(this.db, 'classes', id), {
      ...patch,
      updatedAt: Date.now()
    });
  }

  async cancelClass(id: string) {
    await updateDoc(doc(this.db, 'classes', id), {
      status: 'cancelled',
      updatedAt: Date.now()
    });
  }

  // generate day slots (30-min steps) in teacher's timezone, return ISO UTC strings that are available
  async getAvailableSlotsForDate(teacherId: string, dateIsoYMD: string, durationMin: number, tz: string) {
    // dateIsoYMD -> "YYYY-MM-DD"
    const slots: string[] = [];
    // create local Date for date at 04:00..20:00 in timezone by building ISO without timezone then treating as local
    // Simpler: generate times assuming local (teacher uses system tz) and convert to ISO UTC via Date object.
    for (let hour = 4; hour <= 20; hour++) {
      for (const minute of [0, 30]) {
        const local = new Date(`${dateIsoYMD}T${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}:00`);
        slots.push(local.toISOString());
      }
    }

    // fetch classes that might overlap this day
    const dayStartUtc = new Date(`${dateIsoYMD}T00:00:00`).toISOString();
    const dayEndUtc = new Date(`${dateIsoYMD}T23:59:59`).toISOString();
    const booked = await this.getClasses(teacherId, dayStartUtc, dayEndUtc);

    // helper overlap
    const overlaps = (sStartIso: string, sEndIso: string) => {
      return booked.some(b => !(sEndIso <= b.startTimeUtc || sStartIso >= b.endTimeUtc));
    };

    // filter slots by checking slot [start, start+duration) doesn't overlap
    return slots.filter(slotStartIso => {
      const start = new Date(slotStartIso);
      const end = new Date(start.getTime() + durationMin * 60000);
      return !overlaps(start.toISOString(), end.toISOString());
    });
  }
}