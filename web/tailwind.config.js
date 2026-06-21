/** @type {import('tailwindcss').Config} */
// Identidade clara estilo EasyPanel: branco + azul, cantos arredondados, sombras sutis.
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: '#F8FAFC', // fundo da página (slate-50)
        panel: '#FFFFFF', // cards / sidebar
        panel2: '#F1F5F9', // insets / hover (slate-100)
        ink: '#0F172A', // texto principal (slate-900)
        muted: '#64748B', // rótulos / secundário (slate-500)
        line: '#E2E8F0', // bordas (slate-200)
        brand: {
          DEFAULT: '#2563EB', // azul primário (blue-600)
          bright: '#1D4ED8', // hover (blue-700)
          dim: '#DBEAFE', // azul bem claro (blue-100) p/ chips/ativos
          ink: '#1E40AF', // texto azul escuro (blue-800)
        },
        ok: '#16A34A', // verde (running)
        warn: '#D97706', // âmbar (atenção)
        bad: '#DC2626', // vermelho (falha)
      },
      fontFamily: {
        display: ['Inter', 'system-ui', 'sans-serif'],
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
      },
      boxShadow: {
        card: '0 1px 2px rgba(16,24,40,0.04), 0 1px 3px rgba(16,24,40,0.06)',
        pop: '0 4px 12px rgba(16,24,40,0.08), 0 2px 4px rgba(16,24,40,0.04)',
      },
    },
  },
  plugins: [],
};
