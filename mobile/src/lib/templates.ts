import type { FormField } from './types';

/**
 * Standard sectoral survey forms (spec 1.9), offered when a project is created.
 *
 * A template only pre-fills the form builder — every field stays editable before the project is
 * saved, and nothing ties the project to the template afterwards. Labels are Indonesian because the
 * people filling them in are; keys are short snake_case so they survive the 10-character limit of a
 * shapefile's DBF columns readably.
 */

export interface FormTemplate {
  id: string;
  name: string;
  sector: string;
  description: string;
  fields: FormField[];
}

const f = (
  key: string,
  label: string,
  type: FormField['type'],
  required = false,
  options?: string[],
): FormField => (options ? { key, label, type, required, options } : { key, label, type, required });

export const FORM_TEMPLATES: FormTemplate[] = [
  {
    id: 'forestry',
    name: 'Inventarisasi pohon',
    sector: 'Kehutanan',
    description: 'Tree inventory plots: species, girth, height and condition.',
    fields: [
      f('jenis', 'Jenis pohon', 'text', true),
      f('diameter', 'Diameter setinggi dada (cm)', 'number', true),
      f('tinggi_m', 'Tinggi total (m)', 'number'),
      f('kondisi', 'Kondisi', 'select', true, ['Sehat', 'Sakit', 'Rusak', 'Mati', 'Tumbang']),
      f('tajuk', 'Tutupan tajuk', 'select', false, ['Rapat', 'Sedang', 'Jarang']),
      f('dilindungi', 'Jenis dilindungi', 'boolean'),
    ],
  },
  {
    id: 'roads',
    name: 'Kondisi jalan',
    sector: 'Infrastruktur',
    description: 'Road condition survey for maintenance planning.',
    fields: [
      f('nama_ruas', 'Nama ruas jalan', 'text', true),
      f('perkerasan', 'Jenis perkerasan', 'select', true, ['Aspal', 'Beton', 'Paving', 'Kerikil', 'Tanah']),
      f('kondisi', 'Kondisi', 'select', true, ['Baik', 'Sedang', 'Rusak ringan', 'Rusak berat']),
      f('lebar_m', 'Lebar jalan (m)', 'number'),
      f('rusak_m', 'Panjang kerusakan (m)', 'number'),
      f('drainase', 'Ada drainase', 'boolean'),
    ],
  },
  {
    id: 'buildings',
    name: 'Pendataan bangunan',
    sector: 'Tata ruang',
    description: 'Building census: use, storeys, structure and occupants.',
    fields: [
      f('fungsi', 'Fungsi bangunan', 'select', true, [
        'Rumah tinggal',
        'Komersial',
        'Pendidikan',
        'Kesehatan',
        'Ibadah',
        'Pemerintahan',
        'Lainnya',
      ]),
      f('lantai', 'Jumlah lantai', 'integer', true),
      f('dinding', 'Material dinding', 'select', false, ['Bata', 'Beton', 'Kayu', 'Bambu', 'Lainnya']),
      f('kondisi', 'Kondisi', 'select', false, ['Baik', 'Rusak ringan', 'Rusak berat']),
      f('penghuni', 'Jumlah penghuni', 'integer'),
      f('no_bgn', 'Nomor bangunan', 'text'),
    ],
  },
  {
    id: 'agriculture',
    name: 'Lahan pertanian',
    sector: 'Pertanian',
    description: 'Field-level crop and land use survey.',
    fields: [
      f('komoditas', 'Komoditas', 'text', true),
      f('fase', 'Fase tanam', 'select', true, ['Persiapan lahan', 'Vegetatif', 'Generatif', 'Panen', 'Bera']),
      f('irigasi', 'Jenis irigasi', 'select', false, ['Teknis', 'Setengah teknis', 'Tadah hujan']),
      f('luas_ha', 'Perkiraan luas (ha)', 'number'),
      f('pemilik', 'Pemilik / penggarap', 'text'),
      f('tgl_tanam', 'Tanggal tanam', 'date'),
    ],
  },
  {
    id: 'water',
    name: 'Sarana air & drainase',
    sector: 'Sumber daya air',
    description: 'Channels, culverts, wells and water gates.',
    fields: [
      f('jenis', 'Jenis sarana', 'select', true, ['Saluran', 'Gorong-gorong', 'Sumur', 'Pintu air', 'Bendung', 'Lainnya']),
      f('kondisi', 'Kondisi', 'select', true, ['Baik', 'Tersumbat', 'Rusak']),
      f('dimensi', 'Dimensi (p x l x t)', 'text'),
      f('ada_aliran', 'Ada aliran air', 'boolean'),
      f('cat_teknis', 'Catatan teknis', 'text'),
    ],
  },
  {
    id: 'wildlife',
    name: 'Survei satwa liar',
    sector: 'Konservasi',
    description: 'Encounters and signs of wildlife along transects.',
    fields: [
      f('spesies', 'Spesies', 'text', true),
      f('jumlah', 'Jumlah individu', 'integer', true),
      f('temuan', 'Jenis temuan', 'select', true, ['Perjumpaan langsung', 'Jejak', 'Kotoran', 'Suara', 'Sarang', 'Bekas makan']),
      f('aktivitas', 'Aktivitas', 'text'),
      f('habitat', 'Tipe habitat', 'select', false, ['Hutan primer', 'Hutan sekunder', 'Semak', 'Riparian', 'Kebun']),
    ],
  },
  {
    id: 'utilities',
    name: 'Aset utilitas',
    sector: 'Utilitas',
    description: 'Poles, substations, hydrants and other network assets.',
    fields: [
      f('jenis_aset', 'Jenis aset', 'select', true, ['Tiang listrik', 'Tiang telepon', 'Gardu', 'Hidran', 'Lainnya']),
      f('nomor_aset', 'Nomor aset', 'text', true),
      f('kondisi', 'Kondisi', 'select', false, ['Baik', 'Miring', 'Rusak', 'Hilang']),
      f('operator', 'Operator', 'text'),
    ],
  },
  {
    id: 'disaster',
    name: 'Kaji cepat bencana',
    sector: 'Kebencanaan',
    description: 'Rapid damage assessment after an event.',
    fields: [
      f('kejadian', 'Jenis kejadian', 'select', true, ['Banjir', 'Longsor', 'Kebakaran', 'Angin kencang', 'Gempa']),
      f('kerusakan', 'Tingkat kerusakan', 'select', true, ['Ringan', 'Sedang', 'Berat']),
      f('terdampak', 'Jumlah jiwa terdampak', 'integer'),
      f('akses', 'Akses jalan terbuka', 'boolean'),
      f('tanggal', 'Tanggal kejadian', 'date', true),
    ],
  },
];
