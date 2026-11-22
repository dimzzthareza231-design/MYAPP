import React, { useEffect, useRef, useState } from 'react';
import { AlertCircle } from 'lucide-react';

export interface CloudflareTurnstileProps {
  siteKey?: string;
  onSuccess?: (token: string) => void;
  onError?: (error: any) => void;
  onExpire?: () => void;
  theme?: 'light' | 'dark' | 'auto';
  size?: 'normal' | 'compact' | 'flexible';
  action?: string;
  className?: string;
}

declare global {
  interface Window {
    turnstile?: {
      render: (
        container: HTMLElement | string,
        options: {
          sitekey: string;
          callback?: (token: string) => void;
          'error-callback'?: (error: any) => void;
          'expired-callback'?: () => void;
          theme?: 'light' | 'dark' | 'auto';
          size?: 'normal' | 'compact' | 'flexible';
          action?: string;
        }
      ) => string;
      reset: (widgetId?: string) => void;
      remove: (widgetId?: string) => void;
    };
    onloadTurnstileCallback?: () => void;
  }
}

export function CloudflareTurnstile({
  siteKey,
  onSuccess,
  onError,
  onExpire,
  theme = 'auto',
  size = 'normal',
  action = 'login',
  className = ''
}: CloudflareTurnstileProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);
  const callbacksRef = useRef({ onSuccess, onError, onExpire });
  const [hasError, setHasError] = useState(false);

  callbacksRef.current = { onSuccess, onError, onExpire };
  const effectiveSiteKey = siteKey || import.meta.env.VITE_CLOUDFLARE_TURNSTILE_SITE_KEY || '';

  useEffect(() => {
    let isMounted = true;

    const initTurnstile = () => {
      if (!isMounted || !containerRef.current || !window.turnstile) return;

      try {
        if (widgetIdRef.current) {
          try {
            window.turnstile.remove(widgetIdRef.current);
          } catch {}
          widgetIdRef.current = null;
        }

        containerRef.current.innerHTML = '';

        const id = window.turnstile.render(containerRef.current, {
          sitekey: effectiveSiteKey,
          theme,
          size,
          action,
          callback: (token: string) => {
            if (!isMounted) return;
            setHasError(false);
            callbacksRef.current.onSuccess?.(token);
          },
          'error-callback': (err: any) => {
            if (!isMounted) return;
            console.warn('Cloudflare Turnstile error:', err);
            setHasError(true);
            callbacksRef.current.onError?.(err);
          },
          'expired-callback': () => {
            if (!isMounted) return;
            setHasError(true);
            callbacksRef.current.onExpire?.();
          }
        });

        widgetIdRef.current = id;
      } catch (err) {
        console.warn('Failed to render Turnstile widget:', err);
        if (isMounted) {
          setHasError(true);
          if (onError) onError(err);
        }
      }
    };

    if (!effectiveSiteKey) {
      setHasError(true);
      callbacksRef.current.onError?.(new Error('Cloudflare Turnstile site key is not configured.'));
    } else if (typeof window !== 'undefined') {
      if (window.turnstile) {
        initTurnstile();
      } else {
        const existingScript = document.getElementById('cf-turnstile-script');
        if (!existingScript) {
          const script = document.createElement('script');
          script.id = 'cf-turnstile-script';
          script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
          script.async = true;
          script.defer = true;
          script.onload = () => {
            if (isMounted) initTurnstile();
          };
          script.onerror = () => {
            console.error('Could not load Cloudflare Turnstile script.');
            if (isMounted) {
              setHasError(true);
              callbacksRef.current.onError?.(new Error('Cloudflare Turnstile could not be loaded.'));
            }
          };
          document.head.appendChild(script);
        } else {
          // Poll until turnstile is available
          const interval = setInterval(() => {
            if (window.turnstile) {
              clearInterval(interval);
              if (isMounted) initTurnstile();
            }
          }, 100);

          // Fallback timeout
          setTimeout(() => {
            clearInterval(interval);
            if (isMounted && !window.turnstile) {
              setHasError(true);
              callbacksRef.current.onError?.(new Error('Cloudflare Turnstile timed out.'));
            }
          }, 2500);
        }
      }
    }

    return () => {
      isMounted = false;
      if (widgetIdRef.current && window.turnstile) {
        try {
          window.turnstile.remove(widgetIdRef.current);
        } catch {}
      }
    };
  }, [effectiveSiteKey, theme, size, action]);

  return (
    <div className={`flex flex-col items-center justify-center my-3 ${className}`}>
      <div ref={containerRef} className="min-h-[65px] flex items-center justify-center" />

      {hasError && (
        <div className="mt-2 text-xs text-rose-500 flex items-center gap-1">
          <AlertCircle className="w-3.5 h-3.5" />
          <span>Verifikasi Turnstile tidak tersedia. Aksi diblokir sampai konfigurasi pulih.</span>
        </div>
      )}
    </div>
  );
}
