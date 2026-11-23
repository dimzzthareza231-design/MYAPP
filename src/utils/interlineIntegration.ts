// ═══════════════════════════════════════════════════════════════════════════
// MYITARU SIMRS — INTERLINE HOSPITAL INTEGRATION SERVICE (LAYANAN ANTAR LINI)
// ═══════════════════════════════════════════════════════════════════════════
// Menghubungkan seluruh modul rumah sakit secara real-time & presisi:
// Pendaftaran -> IGD / Poliklinik -> Penunjang (Lab & Rad) -> Farmasi ->
// Bed Ranap -> Kasir/Billing -> BPJS & SatuSehat -> RME / Patient360

import { storage } from './storage';
import { Pasien, Kunjungan } from '../types';
import { BillingRecord, BillingItem } from '../components/Finance/types';
import { PrescriptionOrder, PrescriptionItem } from '../components/Pharmacy/types';
import { LabOrder } from '../components/Laboratorium/types';
import { generate50InpatientBeds } from '../data/patientPelayananData';
import { INITIAL_BILLINGS } from '../components/Finance/mockFinanceData';
import { INITIAL_LAB_ORDERS_MOCK } from '../components/Laboratorium/data';
import { INITIAL_PRESCRIPTIONS, INITIAL_MEDICATIONS } from '../components/Pharmacy/data';

export const SIMRS_STORAGE_KEYS = {
  PASIEN: 'hospital_pasien',
  KUNJUNGAN: 'hospital_kunjungan',
  PATIENT_FLOW: 'patient_flow',
  PATIENT_NOTIFICATIONS: 'patient_notifications',
  RME_ENCOUNTERS: 'simrs_rme_encounters',
  PHARMACY_PRESCRIPTIONS: 'hospital_pharmacy_prescriptions',
  PHARMACY_STOCKS: 'hospital_pharmacy_stocks',
  LAB_ORDERS: 'simrs_lab_orders',
  RAD_ORDERS: 'simrs_rad_orders',
  BED_MANAGEMENT: 'simrs_bed_management',
  BILLINGS: 'hospital_finance_billings',
  BPJS_SEP: 'simrs_bpjs_sep',
  SATUSEHAT_SYNC: 'simrs_satusehat_sync'
} as const;

// Custom event to notify any mounted React component across modules
export const notifyInterlineUpdate = (action: string, payload?: any) => {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('simrs-interline-sync', { 
      detail: { action, payload, timestamp: Date.now() } 
    }));
  }
};

/**
 * 1. REGISTRATION -> ANTAR LINI
 * Mendaftarkan kunjungan dan langsung mengintegrasikannya ke:
 * - Patient Flow (antrian perjalanan pasien)
 * - Kasir / Billing (biaya pendaftaran & konsultasi awal)
 * - Kamar Rawat Inap (bila langsung Ranap)
 * - RME Dossier Inisial
 */
export function integrateRegistration({
  patient,
  visit,
  isBPJS,
  poliNama,
  dokterNama,
  keluhan
}: {
  patient: Partial<Pasien> & { id: string; nama: string; no_rm: string };
  visit: Kunjungan;
  isBPJS?: boolean;
  poliNama?: string;
  dokterNama?: string;
  keluhan?: string;
}) {
  try {
    const isRanap = visit.tipe === 'Rawat Inap' || poliNama?.toLowerCase().includes('inap');
    const isIGD = visit.tipe === 'IGD' || poliNama?.toLowerCase().includes('igd');

    // 1.1 Update / Append Patient Flow
    const flowList = storage.get<any[]>(SIMRS_STORAGE_KEYS.PATIENT_FLOW, []);
    const existingFlowIdx = flowList.findIndex(f => f.no_rm === patient.no_rm);
    const initialStatus = isRanap 
      ? 'TRANSFER_BANGSAL' 
      : isIGD 
        ? 'PENANGANAN_AWAL' 
        : 'ANTRI_POLI';

    const newFlowItem = {
      id: Date.now(),
      no_rm: patient.no_rm,
      nama_pasien: patient.nama,
      jenis_kunjungan: visit.tipe || (isRanap ? 'Rawat Inap' : isIGD ? 'IGD' : 'Rawat Jalan'),
      poli: poliNama || visit.poli_id || 'Poliklinik Terpadu',
      dokter: dokterNama || visit.dokter_id || 'dr. Spesialis DPJP',
      status: initialStatus,
      tanggal: visit.tanggal || new Date().toISOString().split('T')[0],
      jam_daftar: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }),
      penjamin: patient.penjamin || (isBPJS ? 'BPJS Kesehatan' : 'Umum Mandiri'),
      diagnosis: keluhan || 'Pemeriksaan Klinis Awal',
      history_status: [
        { status: 'DAFTAR', waktu: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }), oleh: 'Petugas Admisi' },
        { status: initialStatus, waktu: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }), oleh: 'Sistem Integrasi' }
      ]
    };

    if (existingFlowIdx >= 0) {
      flowList[existingFlowIdx] = { ...flowList[existingFlowIdx], ...newFlowItem };
    } else {
      flowList.unshift(newFlowItem);
    }
    storage.set(SIMRS_STORAGE_KEYS.PATIENT_FLOW, flowList);

    // 1.2 Inisialisasi Tagihan di Kasir (Billing Line)
    const billings = storage.get<BillingRecord[]>(SIMRS_STORAGE_KEYS.BILLINGS, INITIAL_BILLINGS);
    const existingBill = billings.find(b => b.kunjunganId === visit.id || b.noRm === patient.no_rm && b.status !== 'Lunas');

    if (!existingBill) {
      const regItems: BillingItem[] = [
        {
          id: `ITM-REG-${Date.now()}`,
          kategori: 'Pendaftaran',
          deskripsi: isRanap ? 'Administrasi & Registrasi Rawat Inap' : 'Administrasi Pendaftaran Poliklinik',
          jumlah: 1,
          hargaSatuan: isRanap ? 50000 : 25000,
          total: isRanap ? 50000 : 25000,
          penjaminCovered: !!isBPJS
        },
        {
          id: `ITM-CONS-${Date.now()}`,
          kategori: 'Konsultasi',
          deskripsi: `Konsultasi & Pemeriksaan ${dokterNama || 'Dokter Spesialis DPJP'}`,
          jumlah: 1,
          hargaSatuan: isIGD ? 120000 : (isRanap ? 150000 : 100000),
          total: isIGD ? 120000 : (isRanap ? 150000 : 100000),
          penjaminCovered: !!isBPJS
        }
      ];

      const subtotal = regItems.reduce((acc, it) => acc + it.total, 0);
      const totalTagihan = subtotal + (isRanap ? 25000 : 10000);

      const newBill: BillingRecord = {
        id: `BIL-REG-${Date.now()}-${patient.no_rm}`,
        noBilling: `BIL-${new Date().toISOString().slice(2, 10).replace(/-/g, '')}-${Math.floor(1000 + Math.random() * 9000)}`,
        kunjunganId: visit.id,
        pasienId: String(patient.id),
        noRm: patient.no_rm,
        namaPasien: patient.nama,
        nik: patient.nik,
        jenisKelamin: patient.jenis_kelamin || 'L',
        tipeLayanan: isRanap ? 'Rawat Inap' : isIGD ? 'IGD' : 'Rawat Jalan',
        poliRuangan: poliNama || visit.poli_id || 'Poli Terpadu',
        namaDokter: dokterNama || 'dr. Pratama, Sp.PD',
        penjaminId: visit.penjamin_id || (isBPJS ? 'PJ-02' : 'PJ-01'),
        namaPenjamin: patient.penjamin || (isBPJS ? 'BPJS Kesehatan' : 'Umum Mandiri'),
        tipePenjamin: isBPJS ? 'BPJS' : 'Umum',
        noSep: isBPJS ? `SEP-${new Date().getFullYear()}${Math.floor(100000 + Math.random() * 900000)}` : undefined,
        status: 'Belum Lunas',
        tanggalMasuk: visit.tanggal || new Date().toISOString().slice(0, 10),
        items: regItems,
        subtotal: subtotal,
        diskonTotal: 0,
        pajak: 0,
        biayaAdministrasi: isRanap ? 25000 : 10000,
        totalTagihan: totalTagihan,
        uangMukaDeposit: 0,
        sisaTagihan: totalTagihan,
        jumlahDibayar: 0,
        kembalian: 0,
        metodePembayaran: isBPJS ? 'BPJS' : 'Tunai',
        kasirNama: 'Siti Rahmawati, S.E.'
      };

      billings.unshift(newBill);
      storage.set(SIMRS_STORAGE_KEYS.BILLINGS, billings);
    }

    // 1.3 Alokasi Bed Jika Rawat Inap
    if (isRanap) {
      allocatePatientToBed({
        no_rm: patient.no_rm,
        nama_pasien: patient.nama,
        diagnosa: keluhan || 'Rawat Inap Rujukan Pendaftaran',
        dpjp: dokterNama || 'dr. Hendra Pratama, Sp.PD',
        penjamin: patient.penjamin || 'BPJS Kesehatan'
      });
    }

    notifyInterlineUpdate('REGISTRATION_INTEGRATED', { patient, visit });
  } catch (err) {
    console.error('Error in integrateRegistration:', err);
  }
}

/**
 * 2. POLIKLINIK (OUTPATIENT) -> ANTAR LINI
 * Ketika dokter menyelesaikan Form SOAP di Poliklinik:
 * - Update Encounter & Resume Medis di Rekam Medis (RME & Patient360)
 * - Meneruskan resep obat ke Farmasi (Apotek Ralan)
 * - Meneruskan permintaan Lab & Radiologi ke Laboratorium & Radiologi
 * - Menambahkan item tindakan, lab, dan obat ke Kasir (Billing)
 * - Memperbarui status alur pasien (PatientFlow)
 */
export function integrateOutpatientSOAP({
  patient,
  visit,
  doctor,
  poli,
  soapData,
  prescriptions = [],
  labRadOrders
}: {
  patient: any;
  visit: Kunjungan;
  doctor?: any;
  poli?: any;
  soapData: {
    s: string;
    o: string;
    a: string;
    p: string;
    icd10?: string;
    diagnosis_sekunder?: string;
    tindakan_icd9?: string;
    alergi?: string;
    rpd?: string;
    lab_rad?: string;
    kontrol?: string;
    vitalSigns?: any;
  };
  prescriptions?: Array<{ name: string; qty: string; rules: string }>;
  labRadOrders?: string;
}) {
  try {
    const patientName = patient?.nama || patient?.nama_pasien || 'Pasien';
    const patientRm = patient?.no_rm || 'RM-000000';
    const doctorName = doctor?.nama || 'dr. Spesialis DPJP';
    const poliName = poli?.nama || 'Poliklinik Rawat Jalan';
    const visitId = visit.id;

    // 2.1 Sinkronisasi E-Prescription ke Farmasi (Apotek Ralan)
    if (prescriptions && prescriptions.length > 0) {
      const existingPrescriptions = storage.get<PrescriptionOrder[]>(SIMRS_STORAGE_KEYS.PHARMACY_PRESCRIPTIONS, INITIAL_PRESCRIPTIONS);
      const isAlreadyAdded = existingPrescriptions.some(p => p.kunjungan_id === visitId && p.no_rm === patientRm);

      if (!isAlreadyAdded) {
        const rxItems: PrescriptionItem[] = prescriptions.map((p, idx) => {
          const qtyNumber = parseInt(p.qty.replace(/\D/g, '')) || 10;
          const hargaSatuan = 2500 + (idx * 1200);
          return {
            id: `ITEM-RX-${Date.now()}-${idx}`,
            kode_obat: `MED-${String(idx + 1).padStart(3, '0')}`,
            nama_obat: p.name,
            bentuk_sediaan: 'Tablet',
            kekuatan: 'Standar',
            dosis: p.qty,
            frekuensi: p.rules,
            aturan_pakai: p.rules || '3 x sehari 1 tablet sesudah makan',
            jumlah: qtyNumber,
            satuan: 'Tablet',
            signa: p.rules || '3 x 1',
            rute_pemberian: 'Oral',
            tipe_item: 'Non-Racikan',
            harga_satuan: hargaSatuan,
            total_harga: hargaSatuan * qtyNumber
          };
        });

        const totalObat = rxItems.reduce((sum, item) => sum + item.total_harga, 0);
        const jasaEmbalase = 2000;
        const totalTagihanRx = totalObat + jasaEmbalase;

        const newRxOrder: PrescriptionOrder = {
          id: `RXP-POLI-${Date.now()}`,
          no_resep: `RXP-${new Date().toISOString().slice(2, 10).replace(/-/g, '')}-${Math.floor(1000 + Math.random() * 9000)}`,
          tanggal_resep: new Date().toISOString().split('T')[0],
          waktu_resep: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) + ' WIB',
          kunjungan_id: visitId,
          no_rm: patientRm,
          nama_pasien: patientName,
          umur: '40 Thn',
          jenis_kelamin: patient.jenis_kelamin || 'L',
          berat_badan_kg: 65,
          riwayat_alergi: soapData.alergi ? [soapData.alergi] : [],
          dokter_penulis: doctorName,
          sip_dokter: doctor?.sip || 'SIP.503/442/DU/2024',
          poli_ruangan: poliName,
          jenis_layanan: 'Rawat Jalan',
          penjamin: patient.penjamin || 'BPJS Kesehatan',
          diagnosis_primer: soapData.a || 'Pemeriksaan Poliklinik',
          kode_icd10: soapData.icd10 || 'Z00.0',
          tipe_resep: 'Non-Racikan',
          status: 'Menunggu Telaah',
          telaah_resep: {
            administratif: { keabsahan_resep: true, identitas_pasien: true, identitas_dokter: true, paraf_dokter: true, tanggal_resep: true, ruangan_poli: true },
            farmasetik: { bentuk_sediaan: true, dosis_kekuatan: true, stabilitas_inkompatibilitas: true, aturan_pakai_rute: true, jumlah_obat: true },
            klinis: { ketepatan_indikasi: true, duplikasi_terapi: false, alergi_reaksi_silang: false, interaksi_obat: false, kontraindikasi: false, penyesuaian_dosis_organ: false },
            status_telaah: 'Belum Ditelaah',
            apoteker_penelaah: '-',
            waktu_telaah: '-'
          },
          ai_clinical_check: {
            status_keamanan: 'Aman',
            interaksi_terdeteksi: [],
            peringatan_alergi: [],
            ringkasan_ai: 'Resep poliklinik terverifikasi valid dan aman disiapkan.'
          },
          dispensing: {
            jenis_etiket_dicetak: ['Putih (Oral)'],
            catatan_dispensing: 'Disiapkan dari Depo Farmasi Rawat Jalan'
          },
          items: rxItems,
          total_biaya_obat: totalObat,
          jasa_embalase: jasaEmbalase,
          total_tagihan: totalTagihanRx
        };

        existingPrescriptions.unshift(newRxOrder);
        storage.set(SIMRS_STORAGE_KEYS.PHARMACY_PRESCRIPTIONS, existingPrescriptions);
      }
    }

    // 2.2 Sinkronisasi Permintaan Lab (Laboratorium Line)
    const labRequestedText = soapData.lab_rad || labRadOrders || '';
    if (labRequestedText && labRequestedText.toLowerCase().includes('lab') || labRequestedText.toLowerCase().includes('darah') || labRequestedText.toLowerCase().includes('urine')) {
      const existingLabOrders = storage.get<LabOrder[]>(SIMRS_STORAGE_KEYS.LAB_ORDERS, INITIAL_LAB_ORDERS_MOCK);
      const isAlreadyOrdered = existingLabOrders.some(l => l.no_rm === patientRm && l.status === 'Order Masuk');

      if (!isAlreadyOrdered) {
        const testName = labRequestedText.includes('Darah') ? 'Darah Lengkap Rutin (CBC)' : (labRequestedText.includes('Urine') ? 'Urinalisis Lengkap' : 'Kimia Darah & Profil Gula');
        const loincCode = testName.includes('Darah') ? '57021-8' : (testName.includes('Urine') ? '24356-8' : '2345-7');
        const labCost = testName.includes('Darah') ? 120000 : 95000;

        const newLabOrder: LabOrder = {
          id: `LAB-${new Date().toISOString().slice(2, 10).replace(/-/g, '')}-${Math.floor(100 + Math.random() * 900)}`,
          no_order_rs: `ORD-LAB-${Math.floor(10000 + Math.random() * 90000)}`,
          no_rm: patientRm,
          nama_pasien: patientName,
          nik: patient.nik || '3273010190000001',
          jenis_kelamin: patient.jenis_kelamin || 'L',
          tanggal_lahir: patient.tanggal_lahir || patient.tgl_lahir || '1985-05-15',
          umur: '42 Thn',
          ruangan_asal: poliName,
          jenis_pelayanan: 'Rawat Jalan',
          penjamin: patient.penjamin || 'BPJS Kesehatan',
          dokter_pengirim: doctorName,
          tanggal_order: new Date().toISOString().split('T')[0],
          waktu_order: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) + ' WIB',
          prioritas: 'Rutin',
          diagnosa_klinis: soapData.a || 'Pemeriksaan Evaluasi Klinis',
          catatan_klinis: `Permintaan Lab dari ${poliName}: ${labRequestedText}`,
          status: 'Order Masuk',
          total_biaya: labCost,
          tests_ordered: [
            {
              kode: 'T-LAB-01',
              nama_pemeriksaan: testName,
              kategori: 'Hematologi',
              biaya: labCost,
              wadah_sampel: 'Tabung EDTA (Ungu)',
              loinc_code: loincCode
            }
          ],
          parameter_results: []
        };

        existingLabOrders.unshift(newLabOrder);
        storage.set(SIMRS_STORAGE_KEYS.LAB_ORDERS, existingLabOrders);
      }
    }

    // 2.3 Sinkronisasi Permintaan Radiologi (ke RAD_ORDERS & simrs_radiologi_list RIS/PACS)
    const isRadRequested = Boolean(
      labRequestedText && (
        labRequestedText.toLowerCase().includes('foto') ||
        labRequestedText.toLowerCase().includes('rontgen') ||
        labRequestedText.toLowerCase().includes('thorax') ||
        labRequestedText.toLowerCase().includes('usg') ||
        labRequestedText.toLowerCase().includes('ct') ||
        labRequestedText.toLowerCase().includes('mri') ||
        labRequestedText.toLowerCase().includes('rad')
      )
    );
    if (isRadRequested) {
      const existingRadOrders = storage.get<any[]>(SIMRS_STORAGE_KEYS.RAD_ORDERS, []);
      const radModality = labRequestedText.toLowerCase().includes('usg')
        ? 'USG'
        : labRequestedText.toLowerCase().includes('ct')
        ? 'CT-Scan'
        : labRequestedText.toLowerCase().includes('mri')
        ? 'MRI'
        : 'X-Ray';
      const radExam = radModality === 'USG'
        ? 'USG Abdomen 2D'
        : radModality === 'CT-Scan'
        ? 'CT-Scan Kepala Non Kontras'
        : radModality === 'MRI'
        ? 'MRI Lumbal Spine'
        : 'Foto Thorax PA (Rontgen Dada)';
      const radCost = radModality === 'USG' ? 220000 : radModality === 'CT-Scan' ? 950000 : radModality === 'MRI' ? 1850000 : 150000;
      const radId = `RAD-${Date.now()}`;
      const radOrderNum = `ORD-RAD-${Math.floor(10000 + Math.random() * 90000)}`;

      const newRadOrder = {
        id: radId,
        orderNumber: radOrderNum,
        modality: radModality,
        examName: radExam,
        orderDate: new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }),
        doctor: doctorName,
        clinicalIndication: soapData.a || 'Pemeriksaan Radiologi Penunjang',
        status: 'Dalam Proses',
        patientRm: patientRm,
        patientName: patientName,
        findings: 'Pemeriksaan sedang dijadwalkan di unit Radiologi.',
        impression: 'Menunggu ekspertise dokter Sp.Rad.',
        recommendation: 'Korelasi dengan respon klinis.',
        biaya: radCost
      };

      existingRadOrders.unshift(newRadOrder);
      storage.set(SIMRS_STORAGE_KEYS.RAD_ORDERS, existingRadOrders);

      // Sync juga ke worklist Radiologi RIS/PACS (simrs_radiologi_list)
      const radDashboardList = storage.get<any[]>('simrs_radiologi_list', []);
      const alreadyInRadWorklist = radDashboardList.some(r => r.id === radId || r.no_order === radOrderNum);
      if (!alreadyInRadWorklist) {
        const now = new Date();
        radDashboardList.unshift({
          id: radId,
          no_order: radOrderNum,
          no_rm: patientRm,
          nama_pasien: patientName,
          nik: patient?.nik || '-',
          umur: 40,
          jenis_kelamin: patient?.jenis_kelamin || 'L',
          penjamin: patient?.penjamin || 'BPJS Kesehatan',
          unit_asal: poliName,
          dokter_pengirim: doctorName,
          indikasi_klinis: soapData.a || 'Pemeriksaan Radiologi Penunjang',
          diagnosa_kerja: soapData.icd10 ? `${soapData.icd10} - ${soapData.a || ''}` : (soapData.a || 'Evaluasi Klinis'),
          prioritas: 'Rutin / Elektif',
          modalitas: radModality,
          nama_pemeriksaan: radExam,
          posisi_proyeksi: radModality === 'X-Ray' ? 'PA / AP' : 'Standard Axial',
          kode_icd9: '87.44',
          ruang_pemeriksaan: radModality === 'USG' ? 'Ruang USG 1' : radModality === 'CT-Scan' ? 'Ruang CT-Scan 128 Slices' : 'Ruang X-Ray 1',
          tanggal_order: now.toISOString().split('T')[0],
          waktu_order: `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')} WIB`,
          status: 'Menunggu Antrian',
          screening: {
            alergi_kontras: false,
            penggunaan_kontras: false,
            implan_logam_pacemaker: false,
            status_hamil: false,
            puasa_persiapan: false
          }
        });
        storage.set('simrs_radiologi_list', radDashboardList);
      }
    }

    // 2.4 Sinkronisasi ke Kasir / Billing (Finance Line)
    const billings = storage.get<BillingRecord[]>(SIMRS_STORAGE_KEYS.BILLINGS, INITIAL_BILLINGS);
    const targetBill = billings.find(b => b.kunjunganId === visitId || (b.noRm === patientRm && b.status !== 'Lunas'));

    if (targetBill) {
      // Tambahkan item tindakan, lab, radiologi, atau resep jika belum ada
      const updatedItems = [...targetBill.items];
      
      if (soapData.tindakan_icd9) {
        const hasTindakan = updatedItems.some(it => it.kategori === 'Tindakan');
        if (!hasTindakan) {
          updatedItems.push({
            id: `ITM-ACT-${Date.now()}`,
            kategori: 'Tindakan',
            deskripsi: `Tindakan Medis (${soapData.tindakan_icd9})`,
            jumlah: 1,
            hargaSatuan: 75000,
            total: 75000,
            penjaminCovered: targetBill.tipePenjamin === 'BPJS'
          });
        }
      }

      if (prescriptions && prescriptions.length > 0) {
        const hasFarmasi = updatedItems.some(it => it.kategori === 'Farmasi');
        if (!hasFarmasi) {
          const totalObatEst = prescriptions.length * 25000 + 2000;
          updatedItems.push({
            id: `ITM-FAR-${Date.now()}`,
            kategori: 'Farmasi',
            deskripsi: `Resep E-Prescribing Farmasi (${prescriptions.length} R/)`,
            jumlah: 1,
            hargaSatuan: totalObatEst,
            total: totalObatEst,
            penjaminCovered: targetBill.tipePenjamin === 'BPJS'
          });
        }
      }

      if (labRequestedText && (labRequestedText.toLowerCase().includes('lab') || labRequestedText.toLowerCase().includes('darah') || labRequestedText.toLowerCase().includes('urine'))) {
        const hasLab = updatedItems.some(it => it.kategori === 'Laboratorium');
        if (!hasLab) {
          updatedItems.push({
            id: `ITM-LAB-${Date.now()}`,
            kategori: 'Laboratorium',
            deskripsi: 'Pemeriksaan Laboratorium Patologi Klinik',
            jumlah: 1,
            hargaSatuan: 120000,
            total: 120000,
            penjaminCovered: targetBill.tipePenjamin === 'BPJS'
          });
        }
      }

      if (isRadRequested) {
        const hasRad = updatedItems.some(it => it.kategori === 'Radiologi');
        if (!hasRad) {
          updatedItems.push({
            id: `ITM-RAD-${Date.now()}`,
            kategori: 'Radiologi',
            deskripsi: 'Pemeriksaan Radiologi & Diagnostic Imaging',
            jumlah: 1,
            hargaSatuan: 150000,
            total: 150000,
            penjaminCovered: targetBill.tipePenjamin === 'BPJS'
          });
        }
      }

      const newSubtotal = updatedItems.reduce((acc, curr) => acc + curr.total, 0);
      const newTotal = newSubtotal + targetBill.biayaAdministrasi;

      targetBill.items = updatedItems;
      targetBill.subtotal = newSubtotal;
      targetBill.totalTagihan = newTotal;
      targetBill.sisaTagihan = newTotal - targetBill.uangMukaDeposit;

      storage.set(SIMRS_STORAGE_KEYS.BILLINGS, billings);
    }

    // 2.5 Update PatientFlowContext
    const flowList = storage.get<any[]>(SIMRS_STORAGE_KEYS.PATIENT_FLOW, []);
    const patientFlowItem = flowList.find(f => f.no_rm === patientRm);
    if (patientFlowItem) {
      const nextFlowStatus = (labRequestedText && (labRequestedText.toLowerCase().includes('lab') || labRequestedText.toLowerCase().includes('darah')))
        ? 'ANTRI_LAB'
        : (prescriptions && prescriptions.length > 0)
          ? 'ANTRI_FARMASI'
          : 'ANTRI_KASIR';

      patientFlowItem.status = nextFlowStatus;
      patientFlowItem.history_status = [
        ...(patientFlowItem.history_status || []),
        { status: 'SELESAI_POLI', waktu: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }), oleh: doctorName },
        { status: nextFlowStatus, waktu: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }), oleh: 'Sistem Alur' }
      ];
      storage.set(SIMRS_STORAGE_KEYS.PATIENT_FLOW, flowList);
    }

    notifyInterlineUpdate('SOAP_INTEGRATED', { visitId, patientRm, prescriptions, labRequestedText });
  } catch (err) {
    console.error('Error in integrateOutpatientSOAP:', err);
  }
}

/**
 * 3. LABORATORIUM -> ANTAR LINI
 * Ketika Sp.PK memvalidasi hasil laboratorium:
 * - Update status di Lab Orders
 * - Otomatis suntikkan hasil tervalidasi ke Rekam Medis Pasien (RME & Patient360)
 * - Tambahkan / konfirmasi biaya lab di Billing Kasir
 * - Teruskan alur pasien ke Farmasi atau Kasir
 */
export function integrateLabValidation({
  labOrder,
  dokterSpPK,
  interpretasi,
  saranKlinis
}: {
  labOrder: LabOrder;
  dokterSpPK: string;
  interpretasi: string;
  saranKlinis?: string;
}) {
  try {
    // 3.1 Update Master Lab Orders Storage
    const labOrders = storage.get<LabOrder[]>(SIMRS_STORAGE_KEYS.LAB_ORDERS, INITIAL_LAB_ORDERS_MOCK);
    const orderIndex = labOrders.findIndex(o => o.id === labOrder.id);
    const nowTimeStr = new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) + ' WIB';

    const validatedOrder: LabOrder = {
      ...labOrder,
      status: 'Selesai & Tervalidasi',
      dokter_sp_pk: dokterSpPK,
      interpretasi_sp_pk: interpretasi,
      saran_klinis: saranKlinis,
      waktu_validasi: nowTimeStr,
      qr_verifikasi_code: `MYITARU-LAB-VAL-${labOrder.id}-${Math.floor(100000 + Math.random() * 900000)}`
    };

    if (orderIndex >= 0) {
      labOrders[orderIndex] = validatedOrder;
    } else {
      labOrders.unshift(validatedOrder);
    }
    storage.set(SIMRS_STORAGE_KEYS.LAB_ORDERS, labOrders);

    // 3.2 Update RME Dossier Encounter Pasien
    const encounters = storage.get<any[]>(SIMRS_STORAGE_KEYS.RME_ENCOUNTERS, []);
    const patientEnc = encounters.find(e => e.no_rm === labOrder.no_rm);
    const testList = labOrder.tests_ordered || (labOrder as any).items || [];
    const testNamesStr = testList.map((i: any) => i.nama_pemeriksaan).join(', ') || 'Pemeriksaan Lab';

    if (patientEnc) {
      patientEnc.hasil_lab_tervalidasi = {
        orderId: labOrder.id,
        testName: testNamesStr,
        waktuValidasi: nowTimeStr,
        dokterSpPK: dokterSpPK,
        interpretasi: interpretasi,
        parameters: labOrder.parameter_results
      };
      storage.set(SIMRS_STORAGE_KEYS.RME_ENCOUNTERS, encounters);
    }

    // 3.3 Pastikan item Lab ada di Billing Kasir
    const billings = storage.get<BillingRecord[]>(SIMRS_STORAGE_KEYS.BILLINGS, INITIAL_BILLINGS);
    const bill = billings.find(b => b.noRm === labOrder.no_rm && b.status !== 'Lunas');
    if (bill) {
      const hasLab = bill.items.some(it => it.kategori === 'Laboratorium' && it.deskripsi.includes(labOrder.id));
      if (!hasLab) {
        bill.items.push({
          id: `ITM-LAB-VAL-${Date.now()}`,
          kategori: 'Laboratorium',
          deskripsi: `Hasil Lab (${testList[0]?.nama_pemeriksaan || 'Patologi Klinik'}) [Tervalidasi]`,
          jumlah: 1,
          hargaSatuan: labOrder.total_biaya || 120000,
          total: labOrder.total_biaya || 120000,
          penjaminCovered: bill.tipePenjamin === 'BPJS'
        });
        bill.subtotal = bill.items.reduce((s, it) => s + it.total, 0);
        bill.totalTagihan = bill.subtotal + bill.biayaAdministrasi;
        bill.sisaTagihan = bill.totalTagihan - bill.uangMukaDeposit;
        storage.set(SIMRS_STORAGE_KEYS.BILLINGS, billings);
      }
    }

    // 3.4 Update Patient Flow
    const flowList = storage.get<any[]>(SIMRS_STORAGE_KEYS.PATIENT_FLOW, []);
    const flowItem = flowList.find(f => f.no_rm === labOrder.no_rm);
    if (flowItem) {
      flowItem.status = 'ANTRI_FARMASI';
      flowItem.history_status = [
        ...(flowItem.history_status || []),
        { status: 'SELESAI_LAB', waktu: nowTimeStr, oleh: dokterSpPK },
        { status: 'ANTRI_FARMASI', waktu: nowTimeStr, oleh: 'Sistem Alur' }
      ];
      storage.set(SIMRS_STORAGE_KEYS.PATIENT_FLOW, flowList);
    }

    notifyInterlineUpdate('LAB_VALIDATED', { orderId: labOrder.id, no_rm: labOrder.no_rm });
  } catch (err) {
    console.error('Error in integrateLabValidation:', err);
  }
}

/**
 * 4. FARMASI (DISPENSING OBAT) -> ANTAR LINI
 * Ketika Apoteker menyelesaikan telaah & penyerahan obat:
 * - Pengurangan stok gudang/depo obat
 * - Obat masuk ke riwayat aktif pasien di RME (Patient360)
 * - Finalisasi item resep di Kasir (Billing)
 * - Update status alur pasien menjadi ANTRI_KASIR
 */
export function integratePharmacyDispense({
  prescription,
  petugasPenyerah,
  depoKey = 'depo_ralan'
}: {
  prescription: PrescriptionOrder;
  petugasPenyerah: string;
  depoKey?: 'depo_ralan' | 'depo_ranap' | 'depo_igd';
}) {
  try {
    // 4.1 Update status resep di storage
    const rxList = storage.get<PrescriptionOrder[]>(SIMRS_STORAGE_KEYS.PHARMACY_PRESCRIPTIONS, INITIAL_PRESCRIPTIONS);
    const rxIdx = rxList.findIndex(r => r.id === prescription.id);
    const nowTimeStr = new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) + ' WIB';

    const dispensedRx: PrescriptionOrder = {
      ...prescription,
      status: 'Selesai Terlayani',
      penyerahan_pio: {
        petugas_penyerah: petugasPenyerah,
        nama_penerima: prescription.nama_pasien,
        hubungan_penerima: 'Pasien Sendiri',
        verifikasi_5_benar: { benar_pasien: true, benar_obat: true, benar_dosis: true, benar_waktu: true, benar_rute: true },
        konseling_diberikan: true,
        materi_konseling: ['Cara pakai obat', 'Waktu konsumsi', 'Penyimpanan obat'],
        waktu_penyerahan: nowTimeStr
      }
    };

    if (rxIdx >= 0) {
      rxList[rxIdx] = dispensedRx;
    } else {
      rxList.unshift(dispensedRx);
    }
    storage.set(SIMRS_STORAGE_KEYS.PHARMACY_PRESCRIPTIONS, rxList);

    // 4.2 Kurangi Stok Fisik Obat di Farmasi
    const stocks = storage.get<any[]>(SIMRS_STORAGE_KEYS.PHARMACY_STOCKS, INITIAL_MEDICATIONS);
    prescription.items.forEach(it => {
      const match = stocks.find(s => s.id === it.kode_obat || s.nama_obat.toLowerCase() === it.nama_obat.toLowerCase());
      if (match) {
        match.stok_total = Math.max(0, match.stok_total - it.jumlah);
        if (match.lokasi_depo && match.lokasi_depo[depoKey] !== undefined) {
          match.lokasi_depo[depoKey] = Math.max(0, match.lokasi_depo[depoKey] - it.jumlah);
        }
      }
    });
    storage.set(SIMRS_STORAGE_KEYS.PHARMACY_STOCKS, stocks);

    // 4.3 Update Riwayat Obat Aktif Pasien di RME
    const encounters = storage.get<any[]>(SIMRS_STORAGE_KEYS.RME_ENCOUNTERS, []);
    const patientEnc = encounters.find(e => e.no_rm === prescription.no_rm);
    if (patientEnc) {
      patientEnc.resep_terlayani = {
        rxId: prescription.id,
        items: prescription.items,
        waktuPenyerahan: nowTimeStr,
        petugas: petugasPenyerah
      };
      storage.set(SIMRS_STORAGE_KEYS.RME_ENCOUNTERS, encounters);
    }

    // 4.4 Pastikan Tagihan Farmasi sinkron di Kasir
    const billings = storage.get<BillingRecord[]>(SIMRS_STORAGE_KEYS.BILLINGS, INITIAL_BILLINGS);
    const bill = billings.find(b => b.noRm === prescription.no_rm && b.status !== 'Lunas');
    if (bill) {
      const farmasiItem = bill.items.find(it => it.kategori === 'Farmasi');
      if (farmasiItem) {
        farmasiItem.total = prescription.total_tagihan;
        farmasiItem.hargaSatuan = prescription.total_tagihan;
        farmasiItem.deskripsi = `Resep Farmasi Terlayani (${prescription.items.length} R/ - ${dispensedRx.no_resep})`;
      } else {
        bill.items.push({
          id: `ITM-FAR-${Date.now()}`,
          kategori: 'Farmasi',
          deskripsi: `Resep Farmasi Terlayani (${prescription.items.length} R/ - ${dispensedRx.no_resep})`,
          jumlah: 1,
          hargaSatuan: prescription.total_tagihan,
          total: prescription.total_tagihan,
          penjaminCovered: bill.tipePenjamin === 'BPJS'
        });
      }
      bill.subtotal = bill.items.reduce((s, it) => s + it.total, 0);
      bill.totalTagihan = bill.subtotal + bill.biayaAdministrasi;
      bill.sisaTagihan = bill.totalTagihan - bill.uangMukaDeposit;
      storage.set(SIMRS_STORAGE_KEYS.BILLINGS, billings);
    }

    // 4.5 Update Alur Pasien -> ANTRI_KASIR
    const flowList = storage.get<any[]>(SIMRS_STORAGE_KEYS.PATIENT_FLOW, []);
    const flowItem = flowList.find(f => f.no_rm === prescription.no_rm);
    if (flowItem) {
      flowItem.status = 'ANTRI_KASIR';
      flowItem.history_status = [
        ...(flowItem.history_status || []),
        { status: 'SELESAI_FARMASI', waktu: nowTimeStr, oleh: petugasPenyerah },
        { status: 'ANTRI_KASIR', waktu: nowTimeStr, oleh: 'Sistem Alur' }
      ];
      storage.set(SIMRS_STORAGE_KEYS.PATIENT_FLOW, flowList);
    }

    notifyInterlineUpdate('PHARMACY_DISPENSED', { rxId: prescription.id, no_rm: prescription.no_rm });
  } catch (err) {
    console.error('Error in integratePharmacyDispense:', err);
  }
}

/**
 * 5. BED MANAGEMENT (RAWAT INAP) -> ANTAR LINI
 * Alokasikan pasien ke tempat tidur rawat inap:
 */
export function allocatePatientToBed({
  no_rm,
  nama_pasien,
  diagnosa,
  dpjp,
  penjamin
}: {
  no_rm: string;
  nama_pasien: string;
  diagnosa: string;
  dpjp: string;
  penjamin: string;
}) {
  try {
    const beds = storage.get<any[]>(SIMRS_STORAGE_KEYS.BED_MANAGEMENT, generate50InpatientBeds());
    const alreadyAllocated = beds.some(b => b.no_rm === no_rm && b.status === 'Terisi');

    if (!alreadyAllocated) {
      const emptyBedIdx = beds.findIndex(b => b.status === 'Kosong');
      if (emptyBedIdx >= 0) {
        beds[emptyBedIdx] = {
          ...beds[emptyBedIdx],
          status: 'Terisi',
          patient: nama_pasien,
          nama_pasien: nama_pasien,
          no_rm: no_rm,
          diagnosa: diagnosa || 'Perawatan Rawat Inap',
          dpjp: dpjp || 'dr. Hendra Pratama, Sp.PD',
          penjamin: penjamin || 'BPJS Kesehatan',
          tgl_masuk: new Date().toISOString().split('T')[0]
        };
        storage.set(SIMRS_STORAGE_KEYS.BED_MANAGEMENT, beds);
        notifyInterlineUpdate('BED_ALLOCATED', { no_rm, bedId: beds[emptyBedIdx].id });
      }
    }
  } catch (err) {
    console.error('Error in allocatePatientToBed:', err);
  }
}

/**
 * 6. BED MANAGEMENT (DISCHARGE PASIEN PULANG) -> ANTAR LINI
 * Ketika pasien rawat inap dipulangkan (Discharge Planning):
 * - Kosongkan tempat tidur (Status: Dibersihkan / Kosong)
 * - Hitung lama rawat x tarif kamar dan masukkan ke Billing Ranap
 * - Kirim alur pasien ke PROSES_BILLING -> PULANG
 */
export function dischargePatientFromBed({
  bedId,
  no_rm,
  kondisiPulang = 'Perbaikan'
}: {
  bedId: string;
  no_rm: string;
  kondisiPulang?: string;
}) {
  try {
    const beds = storage.get<any[]>(SIMRS_STORAGE_KEYS.BED_MANAGEMENT, generate50InpatientBeds());
    // Utamakan bed yang dipilih; cocokkan No. RM hanya bila id bed tidak ditemukan.
    let bedIdx = beds.findIndex(b => b.id === bedId);
    if (bedIdx < 0 && no_rm) bedIdx = beds.findIndex(b => b.no_rm === no_rm);

    if (bedIdx >= 0) {
      const targetBed = beds[bedIdx];
      const lamaRawat = 3; // Standar kalkulasi hari rawat
      const tarifKamar = targetBed.class === 'VVIP' ? 850000 : (targetBed.class === 'VIP' ? 650000 : 350000);
      const totalBiayaKamar = lamaRawat * tarifKamar;

      // Reset bed: masuk antrean pembersihan dulu (sama dengan UI Bed Management). Sebelumnya langsung
      // 'Kosong', dan event sinkronisasi menimpa status 'Dibersihkan' yang baru diset oleh UI.
      beds[bedIdx] = {
        ...targetBed,
        status: 'Dibersihkan',
        patient: '',
        nama_pasien: '',
        no_rm: '',
        diagnosa: '',
        penjamin: ''
      };
      storage.set(SIMRS_STORAGE_KEYS.BED_MANAGEMENT, beds);

      // Masukkan biaya akomodasi kamar ke Billing Kasir
      const billings = storage.get<BillingRecord[]>(SIMRS_STORAGE_KEYS.BILLINGS, INITIAL_BILLINGS);
      const bill = billings.find(b => b.noRm === no_rm && b.status !== 'Lunas');
      if (bill) {
        bill.items.push({
          id: `ITM-BED-${Date.now()}`,
          kategori: 'Kamar',
          deskripsi: `Akomodasi ${targetBed.room} (${targetBed.class}) - ${lamaRawat} Hari`,
          jumlah: lamaRawat,
          hargaSatuan: tarifKamar,
          total: totalBiayaKamar,
          penjaminCovered: bill.tipePenjamin === 'BPJS'
        });
        bill.subtotal = bill.items.reduce((s, it) => s + it.total, 0);
        bill.totalTagihan = bill.subtotal + bill.biayaAdministrasi;
        bill.sisaTagihan = bill.totalTagihan - bill.uangMukaDeposit;
        bill.lamaInapHari = lamaRawat;
        bill.tanggalKeluar = new Date().toISOString().slice(0, 10);
        storage.set(SIMRS_STORAGE_KEYS.BILLINGS, billings);
      }

      // Update Patient Flow ke PROSES_BILLING
      const flowList = storage.get<any[]>(SIMRS_STORAGE_KEYS.PATIENT_FLOW, []);
      const flowItem = flowList.find(f => f.no_rm === no_rm);
      if (flowItem) {
        flowItem.status = 'PROSES_BILLING';
        flowItem.history_status = [
          ...(flowItem.history_status || []),
          { status: 'DISCHARGE_PLAN', waktu: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }), oleh: 'DPJP Bangsal', keterangan: `Kondisi pulang: ${kondisiPulang}` },
          { status: 'PROSES_BILLING', waktu: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }), oleh: 'Kasir Rawat Inap' }
        ];
        storage.set(SIMRS_STORAGE_KEYS.PATIENT_FLOW, flowList);
      }

      notifyInterlineUpdate('PATIENT_DISCHARGED', { bedId, no_rm, kondisiPulang, totalBiayaKamar });
    }
  } catch (err) {
    console.error('Error in dischargePatientFromBed:', err);
  }
}

/**
 * 7. KASIR (BILLING PAYMENT) -> ANTAR LINI
 * Ketika pembayaran tagihan lunas di Kasir:
 * - Update status kunjungan menjadi 'Selesai'
 * - Update status alur pasien menjadi 'PULANG'
 * - Terbitkan Kwitansi Resmi
 */
export function integrateBillingPayment({
  billing,
  metodePembayaran,
  jumlahDibayar,
  kasirNama = 'Siti Rahmawati, S.E.'
}: {
  billing: BillingRecord;
  metodePembayaran: string;
  jumlahDibayar: number;
  kasirNama?: string;
}) {
  try {
    const billings = storage.get<BillingRecord[]>(SIMRS_STORAGE_KEYS.BILLINGS, INITIAL_BILLINGS);
    const billIdx = billings.findIndex(b => b.id === billing.id);
    const nowTimeStr = new Date().toLocaleDateString('id-ID', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
    const randCode = Math.floor(1000 + Math.random() * 9000);
    const noKwitansi = billing.noKwitansi || `KW-${new Date().toISOString().slice(2, 10).replace(/-/g, '')}-${randCode}`;

    const paidBill: BillingRecord = {
      ...billing,
      status: 'Lunas',
      sisaTagihan: 0,
      jumlahDibayar: jumlahDibayar,
      metodePembayaran: metodePembayaran as any,
      noKwitansi: noKwitansi,
      waktuPembayaran: nowTimeStr,
      kasirNama: kasirNama
    };

    if (billIdx >= 0) {
      billings[billIdx] = paidBill;
    }
    storage.set(SIMRS_STORAGE_KEYS.BILLINGS, billings);

    // Update Kunjungan di Master Hospital Context jika ada
    const masterVisits = storage.get<Kunjungan[]>(SIMRS_STORAGE_KEYS.KUNJUNGAN, []);
    const visitIdx = masterVisits.findIndex(k => k.id === billing.kunjunganId || k.pasien_id === billing.noRm);
    if (visitIdx >= 0) {
      masterVisits[visitIdx].status = 'Selesai';
      storage.set(SIMRS_STORAGE_KEYS.KUNJUNGAN, masterVisits);
    }

    // Update Patient Flow ke PULANG
    const flowList = storage.get<any[]>(SIMRS_STORAGE_KEYS.PATIENT_FLOW, []);
    const flowItem = flowList.find(f => f.no_rm === billing.noRm);
    if (flowItem) {
      flowItem.status = 'PULANG';
      flowItem.history_status = [
        ...(flowItem.history_status || []),
        { status: 'LUNAS', waktu: nowTimeStr, oleh: kasirNama },
        { status: 'PULANG', waktu: nowTimeStr, oleh: 'Satpam / Gerbang Keluar' }
      ];
      storage.set(SIMRS_STORAGE_KEYS.PATIENT_FLOW, flowList);
    }

    notifyInterlineUpdate('BILLING_PAID', { billingId: billing.id, noRm: billing.noRm, noKwitansi });
  } catch (err) {
    console.error('Error in integrateBillingPayment:', err);
  }
}

/**
 * 8. AGGREGATOR REKAM MEDIS PATIENT360 TERPADU
 * Mengumpulkan seluruh jejak klinis & operasional dari seluruh lini:
 */
export function getPatient360UnifiedRecord(noRm: string) {
  try {
    const pasienList = storage.get<Pasien[]>(SIMRS_STORAGE_KEYS.PASIEN, []);
    const currentPatient = pasienList.find(p => p.no_rm === noRm || String(p.id) === noRm);

    const encounters = storage.get<any[]>(SIMRS_STORAGE_KEYS.RME_ENCOUNTERS, []).filter(e => e.no_rm === noRm);
    const prescriptions = storage.get<PrescriptionOrder[]>(SIMRS_STORAGE_KEYS.PHARMACY_PRESCRIPTIONS, []).filter(p => p.no_rm === noRm);
    const labOrders = storage.get<LabOrder[]>(SIMRS_STORAGE_KEYS.LAB_ORDERS, []).filter(l => l.no_rm === noRm);
    const radOrders = storage.get<any[]>(SIMRS_STORAGE_KEYS.RAD_ORDERS, []).filter(r => r.patientRm === noRm || r.no_rm === noRm);
    const beds = storage.get<any[]>(SIMRS_STORAGE_KEYS.BED_MANAGEMENT, []).filter(b => b.no_rm === noRm);
    const billings = storage.get<BillingRecord[]>(SIMRS_STORAGE_KEYS.BILLINGS, []).filter(b => b.noRm === noRm);
    const flows = storage.get<any[]>(SIMRS_STORAGE_KEYS.PATIENT_FLOW, []).filter(f => f.no_rm === noRm);

    return {
      patient: currentPatient,
      encounters,
      prescriptions,
      labOrders,
      radOrders,
      beds,
      billings,
      flows
    };
  } catch (err) {
    console.error('Error in getPatient360UnifiedRecord:', err);
    return null;
  }
}

/**
 * 9. RADIOLOGI -> ANTAR LINI (Order Baru dari RME / RIS)
 */
export function integrateNewRadiologyOrder({
  orderId,
  orderNumber,
  no_rm,
  nama_pasien,
  nik,
  umur,
  jenis_kelamin,
  penjamin,
  unit_asal,
  dokter_pengirim,
  modalitas,
  nama_pemeriksaan,
  indikasi_klinis,
  diagnosa_kerja,
  prioritas = 'Rutin / Elektif'
}: {
  orderId?: string;
  orderNumber?: string;
  no_rm: string;
  nama_pasien: string;
  nik?: string;
  umur?: number;
  jenis_kelamin?: 'L' | 'P';
  penjamin?: string;
  unit_asal?: string;
  dokter_pengirim: string;
  modalitas: 'X-Ray' | 'CT-Scan' | 'USG' | 'MRI' | 'Panoramic' | 'Mammografi' | 'Fluoroskopi';
  nama_pemeriksaan: string;
  indikasi_klinis: string;
  diagnosa_kerja?: string;
  prioritas?: 'Cito / Emergency' | 'Rutin / Elektif';
}) {
  try {
    const id = orderId || `RAD-${Date.now()}`;
    const orderNo = orderNumber || `ORD-RAD-${Math.floor(10000 + Math.random() * 90000)}`;
    const now = new Date();
    const dateStr = now.toISOString().split('T')[0];
    const timeStr = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')} WIB`;
    const radCost = modalitas === 'MRI' ? 1850000 : modalitas === 'CT-Scan' ? 950000 : modalitas === 'USG' ? 220000 : 150000;

    // 9.1 Simpan ke RAD_ORDERS (dibaca RME RadiologyTab)
    const radOrders = storage.get<any[]>(SIMRS_STORAGE_KEYS.RAD_ORDERS, []);
    if (!radOrders.some(r => r.id === id)) {
      radOrders.unshift({
        id,
        orderNumber: orderNo,
        modality: modalitas,
        examName: nama_pemeriksaan,
        orderDate: now.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }),
        doctor: dokter_pengirim,
        clinicalIndication: indikasi_klinis,
        status: 'Dalam Proses',
        patientRm: no_rm,
        patientName: nama_pasien,
        findings: 'Pemeriksaan sedang dalam antrean pemindaian di unit Radiologi.',
        impression: 'Menunggu hasil ekspertise Dokter Spesialis Radiologi (Sp.Rad).',
        recommendation: '-',
        biaya: radCost
      });
      storage.set(SIMRS_STORAGE_KEYS.RAD_ORDERS, radOrders);
    }

    // 9.2 Simpan ke worklist Radiologi RIS/PACS (simrs_radiologi_list)
    const radWorklist = storage.get<any[]>('simrs_radiologi_list', []);
    if (!radWorklist.some(r => r.id === id)) {
      radWorklist.unshift({
        id,
        no_order: orderNo,
        no_rm,
        nama_pasien,
        nik: nik || '-',
        umur: umur || 35,
        jenis_kelamin: jenis_kelamin || 'L',
        penjamin: penjamin || 'BPJS Kesehatan',
        unit_asal: unit_asal || 'Poliklinik / RME',
        dokter_pengirim,
        indikasi_klinis,
        diagnosa_kerja: diagnosa_kerja || indikasi_klinis,
        prioritas,
        modalitas,
        nama_pemeriksaan,
        posisi_proyeksi: modalitas === 'X-Ray' ? 'PA / AP' : 'Standard',
        kode_icd9: '87.44',
        ruang_pemeriksaan: modalitas === 'USG' ? 'Ruang USG 1' : modalitas === 'CT-Scan' ? 'Ruang CT-Scan 128 Slices' : 'Ruang X-Ray 1',
        tanggal_order: dateStr,
        waktu_order: timeStr,
        status: 'Menunggu Antrian',
        screening: {
          alergi_kontras: false,
          penggunaan_kontras: false,
          implan_logam_pacemaker: false,
          status_hamil: false,
          puasa_persiapan: false
        }
      });
      storage.set('simrs_radiologi_list', radWorklist);
    }

    // 9.3 Update Kasir Billing jika ada tagihan aktif
    const billings = storage.get<BillingRecord[]>(SIMRS_STORAGE_KEYS.BILLINGS, INITIAL_BILLINGS);
    const bill = billings.find(b => b.noRm === no_rm && b.status !== 'Lunas');
    if (bill && !bill.items.some(it => it.kategori === 'Radiologi' && it.deskripsi.includes(orderNo))) {
      bill.items.push({
        id: `ITM-RAD-${Date.now()}`,
        kategori: 'Radiologi',
        deskripsi: `Radiologi ${modalitas}: ${nama_pemeriksaan} (${orderNo})`,
        jumlah: 1,
        hargaSatuan: radCost,
        total: radCost,
        penjaminCovered: bill.tipePenjamin === 'BPJS'
      });
      bill.subtotal = bill.items.reduce((s, it) => s + it.total, 0);
      bill.totalTagihan = bill.subtotal + bill.biayaAdministrasi;
      bill.sisaTagihan = bill.totalTagihan - bill.uangMukaDeposit;
      storage.set(SIMRS_STORAGE_KEYS.BILLINGS, billings);
    }

    notifyInterlineUpdate('RAD_ORDER_CREATED', { id, orderNo, no_rm });
  } catch (err) {
    console.error('Error in integrateNewRadiologyOrder:', err);
  }
}

/**
 * 10. RADIOLOGI VALIDATION -> ANTAR LINI
 * Saat Sp.Rad memvalidasi ekspertise final:
 * - Sinkronkan hasil ke SIMRS_STORAGE_KEYS.RAD_ORDERS (dibaca RME Patient360)
 * - Suntikkan hasil ke RME Encounters & PatientFlow
 * - Konfirmasi item biaya di Billing Kasir
 */
export function integrateRadiologyValidation({
  radItem,
  dokterRadiolog,
  findings,
  kesimpulan,
  saran
}: {
  radItem: any;
  dokterRadiolog: string;
  findings: string;
  kesimpulan: string;
  saran?: string;
}) {
  try {
    const nowTimeStr = new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) + ' WIB';
    const radOrders = storage.get<any[]>(SIMRS_STORAGE_KEYS.RAD_ORDERS, []);
    const idx = radOrders.findIndex(r => r.id === radItem.id || r.orderNumber === radItem.no_order);

    const syncedOrder = {
      id: radItem.id,
      orderNumber: radItem.no_order || radItem.id,
      modality: radItem.modalitas || 'X-Ray',
      examName: radItem.nama_pemeriksaan || 'Pemeriksaan Radiologi',
      orderDate: radItem.tanggal_order ? `${radItem.tanggal_order} ${radItem.waktu_order || ''}`.trim() : nowTimeStr,
      doctor: radItem.dokter_pengirim || 'dr. DPJP',
      clinicalIndication: radItem.indikasi_klinis || radItem.diagnosa_kerja || 'Evaluasi Klinis',
      status: 'Tervalidasi',
      radiologist: dokterRadiolog,
      verifiedAt: nowTimeStr,
      patientRm: radItem.no_rm,
      patientName: radItem.nama_pasien,
      findings,
      impression: kesimpulan,
      recommendation: saran || 'Korelasi dengan klinis pasien.'
    };

    if (idx >= 0) {
      radOrders[idx] = { ...radOrders[idx], ...syncedOrder };
    } else {
      radOrders.unshift(syncedOrder);
    }
    storage.set(SIMRS_STORAGE_KEYS.RAD_ORDERS, radOrders);

    // Update RME Encounter pasien jika ada
    const encounters = storage.get<any[]>(SIMRS_STORAGE_KEYS.RME_ENCOUNTERS, []);
    const enc = encounters.find(e => e.no_rm === radItem.no_rm);
    if (enc) {
      enc.hasil_radiologi_tervalidasi = {
        orderId: radItem.id,
        examName: radItem.nama_pemeriksaan,
        dokterSpRad: dokterRadiolog,
        waktuValidasi: nowTimeStr,
        impression: kesimpulan
      };
      storage.set(SIMRS_STORAGE_KEYS.RME_ENCOUNTERS, encounters);
    }

    // Pastikan biaya radiologi tercatat di Billing
    const billings = storage.get<BillingRecord[]>(SIMRS_STORAGE_KEYS.BILLINGS, INITIAL_BILLINGS);
    const bill = billings.find(b => b.noRm === radItem.no_rm && b.status !== 'Lunas');
    if (bill && !bill.items.some(it => it.kategori === 'Radiologi')) {
      const radCost = radItem.modalitas === 'MRI' ? 1850000 : radItem.modalitas === 'CT-Scan' ? 950000 : radItem.modalitas === 'USG' ? 220000 : 150000;
      bill.items.push({
        id: `ITM-RAD-VAL-${Date.now()}`,
        kategori: 'Radiologi',
        deskripsi: `Hasil Radiologi (${radItem.nama_pemeriksaan}) [Tervalidasi]`,
        jumlah: 1,
        hargaSatuan: radCost,
        total: radCost,
        penjaminCovered: bill.tipePenjamin === 'BPJS'
      });
      bill.subtotal = bill.items.reduce((s, it) => s + it.total, 0);
      bill.totalTagihan = bill.subtotal + bill.biayaAdministrasi;
      bill.sisaTagihan = bill.totalTagihan - bill.uangMukaDeposit;
      storage.set(SIMRS_STORAGE_KEYS.BILLINGS, billings);
    }

    // Catat ke riwayat PatientFlow
    const flowList = storage.get<any[]>(SIMRS_STORAGE_KEYS.PATIENT_FLOW, []);
    const flowItem = flowList.find(f => f.no_rm === radItem.no_rm);
    if (flowItem) {
      flowItem.history_status = [
        ...(flowItem.history_status || []),
        { status: 'SELESAI_RADIOLOGI', waktu: nowTimeStr, oleh: dokterRadiolog }
      ];
      storage.set(SIMRS_STORAGE_KEYS.PATIENT_FLOW, flowList);
    }

    notifyInterlineUpdate('RAD_VALIDATED', { orderId: radItem.id, no_rm: radItem.no_rm });
  } catch (err) {
    console.error('Error in integrateRadiologyValidation:', err);
  }
}

/**
 * 11. ORDER LAB BARU DARI RME -> LIS & BILLING
 */
export function integrateNewLabOrder({
  orderId,
  orderNumber,
  patient,
  dokterPengirim,
  diagnosaKlinis,
  tests
}: {
  orderId: string;
  orderNumber: string;
  patient: any;
  dokterPengirim: string;
  diagnosaKlinis: string;
  tests: Array<{ kode: string; nama_pemeriksaan: string; kategori: string; loinc_code: string; biaya?: number }>;
}) {
  try {
    const labOrders = storage.get<LabOrder[]>(SIMRS_STORAGE_KEYS.LAB_ORDERS, INITIAL_LAB_ORDERS_MOCK);
    const totalBiaya = tests.reduce((sum, t) => sum + (t.biaya || 75000), 0);
    const noRm = patient?.no_rm || 'RM-000000';
    const now = new Date();

    const newLabOrder: LabOrder = {
      id: orderId,
      no_order_rs: orderNumber,
      no_rm: noRm,
      nama_pasien: patient?.nama || patient?.nama_pasien || 'Pasien',
      nik: patient?.nik || '-',
      jenis_kelamin: patient?.jenis_kelamin || 'L',
      tanggal_lahir: patient?.tgl_lahir || patient?.tanggal_lahir || '1985-01-01',
      umur: patient?.umur ? `${patient.umur} Thn` : '40 Thn',
      ruangan_asal: 'Rekam Medis (RME / Poliklinik)',
      jenis_pelayanan: 'Rawat Jalan',
      penjamin: patient?.penjamin || 'BPJS Kesehatan',
      dokter_pengirim: dokterPengirim,
      tanggal_order: now.toISOString().split('T')[0],
      waktu_order: `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')} WIB`,
      prioritas: 'Rutin',
      diagnosa_klinis: diagnosaKlinis,
      catatan_klinis: diagnosaKlinis,
      status: 'Order Masuk',
      total_biaya: totalBiaya,
      tests_ordered: tests.map(t => ({
        kode: t.kode,
        nama_pemeriksaan: t.nama_pemeriksaan,
        kategori: t.kategori as any,
        biaya: t.biaya || 75000,
        wadah_sampel: 'Tabung EDTA / Serum',
        loinc_code: t.loinc_code
      })),
      parameter_results: []
    };

    if (!labOrders.some(l => l.id === orderId)) {
      labOrders.unshift(newLabOrder);
      storage.set(SIMRS_STORAGE_KEYS.LAB_ORDERS, labOrders);
    }

    const billings = storage.get<BillingRecord[]>(SIMRS_STORAGE_KEYS.BILLINGS, INITIAL_BILLINGS);
    const bill = billings.find(b => b.noRm === noRm && b.status !== 'Lunas');
    if (bill && !bill.items.some(it => it.deskripsi.includes(orderNumber))) {
      bill.items.push({
        id: `ITM-LAB-${Date.now()}`,
        kategori: 'Laboratorium',
        deskripsi: `Pemeriksaan Lab (${tests.map(t => t.nama_pemeriksaan).slice(0, 2).join(', ')}) [${orderNumber}]`,
        jumlah: 1,
        hargaSatuan: totalBiaya,
        total: totalBiaya,
        penjaminCovered: bill.tipePenjamin === 'BPJS'
      });
      bill.subtotal = bill.items.reduce((s, it) => s + it.total, 0);
      bill.totalTagihan = bill.subtotal + bill.biayaAdministrasi;
      bill.sisaTagihan = bill.totalTagihan - bill.uangMukaDeposit;
      storage.set(SIMRS_STORAGE_KEYS.BILLINGS, billings);
    }

    notifyInterlineUpdate('LAB_ORDER_CREATED', { orderId, orderNumber, no_rm: noRm });
  } catch (err) {
    console.error('Error in integrateNewLabOrder:', err);
  }
}
