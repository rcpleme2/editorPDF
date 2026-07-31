# EditorPDF

Editor de PDF que roda 100% no navegador — nenhum arquivo é enviado a um servidor. Feito com React, TypeScript, Vite, [pdf-lib](https://pdf-lib.js.org/) e [pdf.js](https://mozilla.github.io/pdf.js/).

## Funcionalidades

- **Upload** de um ou mais PDFs (arrastar e soltar ou seleção de arquivo)
- **Organização de páginas**: reordenar (arrastar miniaturas), excluir, duplicar, rotacionar, mesclar vários PDFs em um, dividir em arquivos separados (.zip)
- **Cortar página** (crop) com seleção visual da área
- **Texto**: inserir texto novo, ou clicar em um texto existente para cobri-lo e substituí-lo (edição por sobreposição — PDFs não têm parágrafos editáveis como o Word, então essa é a abordagem usada também por editores como Adobe/ILovePDF/SmallPDF)
- **Anotações**: realce (highlight), desenho livre, retângulo, círculo, linha, seta e notas adesivas
- **Exportar** o PDF final editado

## Rodando localmente

Pré-requisitos: [Node.js](https://nodejs.org/) 18+.

```bash
npm install
npm run dev
```

Abra o endereço mostrado no terminal (geralmente `http://localhost:5173`).

Para gerar a build de produção:

```bash
npm run build
npm run preview   # serve a build localmente para conferir
```

## Deploy gratuito

Como a aplicação é 100% front-end (sem back-end nem banco de dados), qualquer serviço de hospedagem estática gratuita funciona. Ela é uma SPA gerada em `dist/` pelo `npm run build`.

### Vercel
1. Crie uma conta em [vercel.com](https://vercel.com) e importe este repositório.
2. Framework preset: **Vite**. Build command: `npm run build`. Output directory: `dist`.
3. Deploy — pronto, você recebe uma URL pública gratuita.

### Netlify
1. Crie uma conta em [netlify.com](https://netlify.com) e importe o repositório.
2. Build command: `npm run build`. Publish directory: `dist`.

### GitHub Pages
1. Rode `npm run build`.
2. Publique o conteúdo de `dist/` na branch `gh-pages` (pode usar a action `peaceiris/actions-gh-pages` ou o pacote `gh-pages`).
3. Se o site não ficar na raiz do domínio (ex: `usuario.github.io/editorpdf`), defina `base: '/editorpdf/'` em `vite.config.ts`.

## Arquitetura

```
src/
├── types.ts                 # Tipos de anotações, páginas, etc.
├── state/useEditorStore.ts  # Estado global (zustand)
├── lib/
│   ├── pdfEngine.ts          # Operações com pdf-lib (crop, rotação, export, split)
│   ├── pdfRender.ts          # Renderização de páginas com pdf.js
│   └── geometry.ts           # Conversão entre coordenadas de tela e de PDF
└── components/
    ├── Dropzone.tsx
    ├── ThumbnailSidebar.tsx   # Miniaturas com reordenação (drag & drop)
    ├── PageCanvas.tsx         # Área principal de edição
    ├── AnnotationView.tsx     # Renderização/edição de cada anotação
    └── Toolbar.tsx
```

Todas as edições ficam em memória no navegador até você clicar em **Baixar PDF** — nada é enviado para fora do seu computador.

## Limitações conhecidas

- A "edição de texto" cobre o texto original com uma caixa branca e escreve o novo texto por cima — não é uma reflow real de parágrafo (isso é uma limitação inerente ao formato PDF, não apenas desta ferramenta).
- Anotações em páginas rotacionadas têm sua posição/caixa ajustadas corretamente, mas o texto dentro delas não gira visualmente na tela (a orientação final no PDF exportado segue a posição definida).
