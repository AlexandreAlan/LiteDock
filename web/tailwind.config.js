/** @type {import('tailwindcss').Config} */
// Idêntico ao EasyPanel atual: tema claro neutro (shadcn/ui) + acento VERDE.
// Cores extraídas da demo ao vivo (demo.easypanel.io) e da UI oficial.
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: '#FAFAFA', // fundo da página (neutral-50)
        panel: '#FFFFFF', // cards / sidebar (branco)
        panel2: '#F5F5F5', // insets / hover (neutral-100)
        ink: '#171717', // texto principal (neutral-900)
        muted: '#737373', // rótulos / ajuda (neutral-500)
        line: '#E5E5E5', // bordas (neutral-200)
        brand: {
          DEFAULT: '#059669', // verde EasyPanel (emerald-600)
          bright: '#047857', // hover (emerald-700)
          dim: '#D1FAE5', // verde bem claro (emerald-100) p/ chips/ativos
          ink: '#065F46', // verde escuro p/ texto (emerald-800)
        },
        ok: '#16A34A', // running
        warn: '#D97706', // atenção
        bad: '#DC2626', // destrutivo / falha
      },
      fontFamily: {
        display: ['Inter', 'system-ui', 'sans-serif'],
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
      },
      borderRadius: {
        lg: '0.625rem', // 10px — raio do EasyPanel (--radius)
        xl: '0.75rem',
      },
      boxShadow: {
        card: '0 1px 2px rgba(16,24,40,0.04), 0 1px 3px rgba(16,24,40,0.06)',
        pop: '0 4px 12px rgba(16,24,40,0.08), 0 2px 4px rgba(16,24,40,0.04)',
      },
    },
  },
  plugins: [],
};
