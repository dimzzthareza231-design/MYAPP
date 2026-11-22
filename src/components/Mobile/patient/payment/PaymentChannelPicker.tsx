import React from 'react';
import { Building2, ChevronRight, Globe, QrCode, Wallet } from 'lucide-react';
import { GROUP_LABELS, type PaymentChannel, type PaymentChannelGroup } from './paymentApi';

const GROUP_ORDER: PaymentChannelGroup[] = ['VIRTUAL_ACCOUNT', 'EWALLET', 'QRIS', 'PAYPAL'];
const GROUP_ICONS: Record<PaymentChannelGroup, React.ComponentType<{ className?: string }>> = {
  VIRTUAL_ACCOUNT: Building2,
  EWALLET: Wallet,
  QRIS: QrCode,
  PAYPAL: Globe
};

/** Daftar kanal pembayaran dikelompokkan; hanya label teks (tanpa logo pihak ketiga). */
export const PaymentChannelPicker: React.FC<{
  channels: PaymentChannel[];
  unavailable: PaymentChannel[];
  busyChannel: string | null;
  onSelect: (channel: PaymentChannel) => void;
}> = ({ channels, unavailable, busyChannel, onSelect }) => (
  <div className="space-y-5">
    {GROUP_ORDER.map((group) => {
      const items = channels.filter((channel) => channel.group === group);
      if (items.length === 0) return null;
      const Icon = GROUP_ICONS[group];
      const headingId = `payment-group-${group}`;
      return (
        <section key={group} aria-labelledby={headingId} className="space-y-2">
          <h4 id={headingId} className="flex items-center gap-2 text-sm font-extrabold text-slate-800">
            <Icon className="w-4 h-4 text-[#0B3D91]" aria-hidden="true" />
            {GROUP_LABELS[group]}
          </h4>
          <ul className="space-y-2">
            {items.map((channel) => (
              <li key={channel.id}>
                <button
                  type="button"
                  onClick={() => onSelect(channel)}
                  disabled={busyChannel !== null}
                  aria-busy={busyChannel === channel.id}
                  className="w-full min-h-[48px] px-4 rounded-xl border border-slate-200 bg-white hover:border-[#0B3D91] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#0B3D91] disabled:opacity-60 flex items-center justify-between gap-3 text-left text-sm font-bold text-slate-800 cursor-pointer"
                >
                  <span>{channel.label}</span>
                  {busyChannel === channel.id ? (
                    <span className="text-sm font-semibold text-slate-600">Memproses...</span>
                  ) : (
                    <ChevronRight className="w-4 h-4 text-slate-400" aria-hidden="true" />
                  )}
                </button>
              </li>
            ))}
          </ul>
        </section>
      );
    })}

    {unavailable.length > 0 && (
      <section aria-labelledby="payment-unavailable" className="rounded-xl bg-slate-50 border border-slate-200 p-3 space-y-1.5">
        <h4 id="payment-unavailable" className="text-sm font-bold text-slate-700">Belum tersedia</h4>
        <ul className="space-y-1 text-sm text-slate-600">
          {unavailable.map((channel) => (
            <li key={channel.id}>
              <span className="font-semibold">{channel.label}</span>
              {channel.reason ? ` — ${channel.reason}` : ''}
            </li>
          ))}
        </ul>
      </section>
    )}
  </div>
);
