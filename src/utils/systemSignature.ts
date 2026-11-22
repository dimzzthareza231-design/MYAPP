/**
 * @license Apache-2.0
 * Copyright (c) 2026 Dimas Pangestu Putra Alifia. All Rights Reserved.
 * Original Creator & Architect of MYITARU.
 * Prohibits removal of original author attribution upon redistribution or derivative works.
 */

export const MYITARU_COPYRIGHT = Object.freeze({
  appName: 'MYITARU',
  version: '1.0.0-hibah',
  year: 2026,
  originalCreator: 'Dimas Pangestu Putra Alifia',
  studentId: '22111016',
  program: 'Jurusan Rekam Medis dan Informatika Kesehatan (RMIK)',
  institution: 'Institut Tarumanagara',
  license: 'Apache-2.0 (Mandatory Attribution)',
  djkiStatus: 'Tercatat / Dalam Proses Pencatatan Hak Cipta Program Komputer DJKI',
});

export function printSystemSignature(): void {
  if (typeof window === 'undefined') return;
  const w = window as unknown as Record<string, unknown>;
  if (w.__MYITARU_SIGNATURE_LOGGED__) return;
  w.__MYITARU_SIGNATURE_LOGGED__ = true;

  console.info(
    `%c ${MYITARU_COPYRIGHT.appName} %c v${MYITARU_COPYRIGHT.version} `,
    'background:#1e3a8a;color:#fff;font-weight:bold;padding:4px 8px;border-radius:4px 0 0 4px;',
    'background:#0f766e;color:#fff;font-weight:bold;padding:4px 8px;border-radius:0 4px 4px 0;'
  );
  console.info(
    `Original Creator: ${MYITARU_COPYRIGHT.originalCreator} (${MYITARU_COPYRIGHT.program} - ${MYITARU_COPYRIGHT.institution}) | License: ${MYITARU_COPYRIGHT.license}`
  );
}
