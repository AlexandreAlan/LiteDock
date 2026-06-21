/** @type {import('tailwindcss').Config} */
// Identidade "Sala de Máquinas": carvão quente, cobre, medidores e mono.
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: '#16140F', // carvão quente (fundo)
        panel: '#211D16', // superfície elevada
        panel2: '#2B261C', // cards / inputs
        ink: '#EDE6D6', // texto principal (off-white quente)
        muted: '#8A7F6B', // rótulos / secundário
        line: '#332C20', // hairline / bordas
        copper: {
          DEFAULT: '#C8843C', // acento (ações, ativo)
          bright: '#E0A05A', // hover / brilho
          dim: '#7A5226', // copper apagado (trilhos de gauge)
        },
        ok: '#7FA650', // latão-verde (operando)
        warn: '#D9A441', // atenção
        bad: '#C25A40', // falha / parado
      },
      fontFamily: {
        display: ['"Space Grotesk"', 'system-ui', 'sans-serif'],
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
      },
      letterSpacing: {
        stamp: '0.18em', // rótulos cravados
      },
      boxShadow: {
        plate: 'inset 0 1px 0 rgba(237,230,214,0.04), 0 1px 2px rgba(0,0,0,0.5)',
        glow: '0 0 0 1px rgba(200,132,60,0.4), 0 0 18px -6px rgba(200,132,60,0.5)',
      },
      backgroundImage: {
        // textura sutil de chapa rebitada (tamanho aplicado via bg-[length:...])
        rivets:
          'radial-gradient(rgba(237,230,214,0.05) 1px, transparent 1px)',
      },
    },
  },
  plugins: [],
};
