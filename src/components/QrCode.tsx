import { useEffect, useState } from 'react';
import QRCode from 'qrcode';

interface QrCodeProps {
  value: string;
  size?: number;
  className?: string;
  label?: string;
}

export function QrCode({ value, size = 240, className = '', label = 'QR Code' }: QrCodeProps) {
  const [svgMarkup, setSvgMarkup] = useState<string>('');

  useEffect(() => {
    let active = true;
    QRCode.toString(value, {
      type: 'svg',
      width: size,
      margin: 1,
      errorCorrectionLevel: 'M',
      color: {
        dark: '#3D3A35',
        light: '#FAF7F2',
      },
    })
      .then((svg) => {
        if (active) setSvgMarkup(svg);
      })
      .catch((err) => {
        console.warn('Local QR generation error:', err);
      });
    return () => {
      active = false;
    };
  }, [value, size]);

  if (!svgMarkup) {
    return (
      <div
        role="img"
        aria-label={label}
        style={{ width: size, height: size }}
        className={`rounded-xl bg-[#FAF7F2] animate-pulse ${className}`}
      />
    );
  }

  return (
    <div
      role="img"
      aria-label={label}
      className={`[&>svg]:w-full [&>svg]:h-full [&>svg]:block ${className}`}
      dangerouslySetInnerHTML={{ __html: svgMarkup }}
    />
  );
}
