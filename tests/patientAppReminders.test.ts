// Helper murni pengingat aplikasi pasien: berkas .ics & jadwal pengingat obat (disimpan lokal).
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildIcsEvent,
  dosesPerDay,
  escapeIcsText,
  foldIcsLine,
  icsFileName,
  loadReminders,
  MED_REMINDER_STORAGE_KEY,
  nextOccurrence,
  parseExplicitDate,
  parseTimeRange,
  saveReminders,
  sortTimes,
  suggestReminderTimes,
  upcomingReminders,
  type MedicineReminder
} from '../src/components/Mobile/patient/reminders';

const NOW = new Date(Date.UTC(2026, 10, 22, 1, 2, 3));

function unfold(ics: string): string[] {
  return ics.replace(/\r\n /g, '').split('\r\n');
}

describe('iCalendar (.ics)', () => {
  test('acara berjam memakai floating time, durasi dari jam selesai, dan alarm', () => {
    const ics = buildIcsEvent({
      uid: 'visit-abc',
      title: 'Kontrol Poli Jantung',
      date: '2026-12-01',
      startTime: '08:00',
      endTime: '12:00',
      location: 'Poli Jantung, RS Contoh',
      description: 'Nomor antrean: A-001\nBawa KTP',
      alarmMinutesBefore: 120,
      now: NOW
    });
    const lines = unfold(ics);
    assert.equal(lines[0], 'BEGIN:VCALENDAR');
    assert.ok(ics.endsWith('END:VCALENDAR\r\n'));
    assert.ok(lines.includes('DTSTART:20261201T080000'));
    assert.ok(lines.includes('DTEND:20261201T120000'));
    assert.ok(lines.includes('DTSTAMP:20261122T010203Z'));
    assert.ok(lines.includes('UID:visit-abc@myitaru'));
    assert.ok(lines.includes('LOCATION:Poli Jantung\\, RS Contoh'));
    assert.ok(lines.includes('DESCRIPTION:Nomor antrean: A-001\\nBawa KTP'));
    assert.ok(lines.includes('TRIGGER:-PT120M'));
  });

  test('tanpa jam → acara sepanjang hari (DTEND hari berikutnya, lintas bulan)', () => {
    const lines = unfold(buildIcsEvent({ uid: 'k', title: 'Kontrol', date: '2026-12-31', now: NOW }));
    assert.ok(lines.includes('DTSTART;VALUE=DATE:20261231'));
    assert.ok(lines.includes('DTEND;VALUE=DATE:20270101'));
    assert.equal(lines.some((l) => l.startsWith('BEGIN:VALARM')), false);
  });

  test('tanpa jam selesai memakai durasi default 60 menit', () => {
    const lines = unfold(buildIcsEvent({ uid: 'k', title: 'X', date: '2026-12-01', startTime: '23:30', now: NOW }));
    assert.ok(lines.includes('DTEND:20261202T003000'));
  });

  test('tanggal tidak valid ditolak', () => {
    assert.throws(() => buildIcsEvent({ uid: 'x', title: 'x', date: '01-12-2026' }));
  });

  test('escape & pelipatan baris sesuai RFC 5545', () => {
    assert.equal(escapeIcsText('a;b,c\\d\ne'), 'a\\;b\\,c\\\\d\\ne');
    const long = `SUMMARY:${'é'.repeat(80)}`;
    const folded = foldIcsLine(long);
    const enc = new TextEncoder();
    for (const part of folded.split('\r\n')) assert.ok(enc.encode(part).length <= 75);
    assert.equal(folded.replace(/\r\n /g, ''), long);
  });

  test('nama berkas aman', () => {
    assert.equal(icsFileName('Kunjungan Poli Anak & Gizi', '2026-12-01'), 'kunjungan-poli-anak-gizi-2026-12-01.ics');
  });
});

describe('parser tanggal & jam', () => {
  test('tanggal eksplisit berbagai format; teks relatif tidak ditebak', () => {
    assert.equal(parseExplicitDate('Kontrol 2026-12-05 ke Poli'), '2026-12-05');
    assert.equal(parseExplicitDate('05/12/2026'), '2026-12-05');
    assert.equal(parseExplicitDate('Kontrol tgl 5 Desember 2026'), '2026-12-05');
    assert.equal(parseExplicitDate('1 Minggu kemudian ke Poli Terkait'), null);
    assert.equal(parseExplicitDate('31/02/2026'), null);
    assert.equal(parseExplicitDate(''), null);
  });

  test('jam praktik', () => {
    assert.deepEqual(parseTimeRange('08:00 - 12:00'), { start: '08:00', end: '12:00' });
    assert.deepEqual(parseTimeRange('8.30-14.00 WIB'), { start: '08:30', end: '14:00' });
    assert.deepEqual(parseTimeRange('13:00'), { start: '13:00', end: null });
    assert.equal(parseTimeRange('Sesuai perjanjian'), null);
  });
});

describe('jadwal pengingat obat', () => {
  test('jumlah dosis per hari dari aturan pakai', () => {
    assert.equal(dosesPerDay('3x1'), 3);
    assert.equal(dosesPerDay('2 x sehari sesudah makan'), 2);
    assert.equal(dosesPerDay('1 kali sehari'), 1);
    assert.equal(dosesPerDay('Tiap 8 jam'), 3);
    assert.equal(dosesPerDay('setiap 12 jam'), 2);
    assert.equal(dosesPerDay('tiap 5 jam'), null);
    assert.equal(dosesPerDay('BID'), 2);
    assert.equal(dosesPerDay('Bila perlu (3x1)'), null);
    assert.equal(dosesPerDay(''), null);
  });

  test('usulan jam & normalisasi', () => {
    assert.deepEqual(suggestReminderTimes('3x1'), ['07:00', '13:00', '19:00']);
    assert.deepEqual(suggestReminderTimes('prn'), []);
    assert.deepEqual(sortTimes(['19:00', '7:00', '07:00', '25:00', '', null]), ['07:00', '19:00']);
  });

  test('kejadian berikutnya (hari ini atau besok)', () => {
    const now = new Date(2026, 10, 22, 14, 0);
    assert.deepEqual(nextOccurrence(['07:00', '19:00'], now), new Date(2026, 10, 22, 19, 0));
    assert.deepEqual(nextOccurrence(['07:00'], now), new Date(2026, 10, 23, 7, 0));
    assert.equal(nextOccurrence([], now), null);
  });

  test('upcomingReminders hanya pengingat aktif dalam horizon, terurut', () => {
    const base: Omit<MedicineReminder, 'id' | 'medName' | 'times' | 'enabled'> = { dose: '', instruction: '', createdAt: '' };
    const list: MedicineReminder[] = [
      { ...base, id: 'a', medName: 'A', times: ['20:00', '08:00'], enabled: true },
      { ...base, id: 'b', medName: 'B', times: ['15:00'], enabled: true },
      { ...base, id: 'c', medName: 'C', times: ['16:00'], enabled: false }
    ];
    const now = new Date(2026, 10, 22, 14, 0);
    const out = upcomingReminders(list, now);
    assert.deepEqual(
      out.map((o) => [o.reminder.id, o.at.getHours(), o.at.getDate()]),
      [
        ['b', 15, 22],
        ['a', 20, 22],
        ['a', 8, 23]
      ]
    );
  });
});

describe('penyimpanan lokal pengingat', () => {
  function memoryStorage() {
    const map = new Map<string, string>();
    return {
      map,
      getItem: (k: string) => map.get(k) ?? null,
      setItem: (k: string, v: string) => void map.set(k, v)
    };
  }
  const reminder: MedicineReminder = {
    id: 'med-amlodipin',
    medName: 'Amlodipin',
    dose: '5 mg',
    instruction: '1x1',
    times: ['19:00', '07:00'],
    enabled: true,
    createdAt: '2026-11-22T00:00:00.000Z'
  };

  test('disimpan per pemilik (No. RM) dan dibaca kembali dengan jam terurut', () => {
    const storage = memoryStorage();
    assert.equal(saveReminders(storage, 'RM-1', [reminder]), true);
    assert.deepEqual(loadReminders(storage, 'RM-1')[0].times, ['07:00', '19:00']);
    assert.deepEqual(loadReminders(storage, 'RM-2'), []);
    saveReminders(storage, 'RM-1', []);
    assert.deepEqual(JSON.parse(storage.map.get(MED_REMINDER_STORAGE_KEY)!), {});
  });

  test('penyimpanan rusak/diblokir tidak melempar galat', () => {
    const broken = { getItem: () => '{not json', setItem: () => undefined };
    assert.deepEqual(loadReminders(broken, 'RM-1'), []);
    const throwing = {
      getItem: () => {
        throw new Error('SecurityError');
      },
      setItem: () => {
        throw new Error('QuotaExceeded');
      }
    };
    assert.deepEqual(loadReminders(throwing, 'RM-1'), []);
    assert.equal(saveReminders(throwing, 'RM-1', [reminder]), false);
    assert.equal(saveReminders(null, 'RM-1', [reminder]), false);
  });
});
