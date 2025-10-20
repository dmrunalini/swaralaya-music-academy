import { fromZonedTime, toZonedTime, formatInTimeZone } from 'date-fns-tz';

const TZ_ABBR_TO_IANA: Record<string, string> = {
  // Americas
  EST: 'America/New_York', EDT: 'America/New_York',
  CST: 'America/Chicago',  CDT: 'America/Chicago',
  MST: 'America/Denver',   MDT: 'America/Denver',
  PST: 'America/Los_Angeles', PDT: 'America/Los_Angeles',
  AKST: 'America/Anchorage', AKDT: 'America/Anchorage',
  HST: 'Pacific/Honolulu',

  // Europe/Africa/Asia
  GMT: 'Etc/GMT', UTC: 'Etc/UTC',
  BST: 'Europe/London',  // UK
  CET: 'Europe/Berlin', CEST: 'Europe/Berlin',
  EET: 'Europe/Athens', EEST: 'Europe/Athens',
  MSK: 'Europe/Moscow',
  WET: 'Europe/Lisbon', WEST: 'Europe/Lisbon',

  IST: 'Asia/Kolkata',
  TRT: 'Europe/Istanbul',
  GST: 'Asia/Dubai',
  PKT: 'Asia/Karachi',
  AFT: 'Asia/Kabul',
  NPT: 'Asia/Kathmandu',
  MMT: 'Asia/Yangon',
  ICT: 'Asia/Bangkok',
  HKT: 'Asia/Hong_Kong',
  SGT: 'Asia/Singapore',
  MYT: 'Asia/Kuala_Lumpur',
  PHT: 'Asia/Manila',
  JST: 'Asia/Tokyo',
  KST: 'Asia/Seoul',

  // AU/NZ
  AWST: 'Australia/Perth',
  ACST: 'Australia/Adelaide', ACDT: 'Australia/Adelaide',
  AEST: 'Australia/Sydney',   AEDT: 'Australia/Sydney',
  NZST: 'Pacific/Auckland',   NZDT: 'Pacific/Auckland'
};

export function abbrToIana(abbr: string | undefined): string {
  if (!abbr) return 'Etc/UTC';
  return TZ_ABBR_TO_IANA[abbr] ?? 'Etc/UTC';
}

// Convert a local datetime (e.g., '2025-10-18T15:00') in teacher’s TZ to UTC ISO
export function localToUtcIso(localIso: string, tzAbbr: string): string {
  const iana = abbrToIana(tzAbbr);
  const utc = fromZonedTime(localIso, iana);
  return utc.toISOString();
}

// Convert UTC ISO to a Date in viewer’s TZ; format for display
export function utcIsoToLocalLabel(utcIso: string, tzAbbr: string, fmt = 'yyyy-MM-dd HH:mm zzz'): string {
  const iana = abbrToIana(tzAbbr);
  const d = toZonedTime(utcIso, iana);
  return formatInTimeZone(d, iana, fmt);
}