# EditorPDF

Editor de PDF que roda 100% no navegador — nenhum arquivo é enviado a um servidor. Feito com React, TypeScript, Vite, [pdf-lib](https://pdf-lib.js.org/) e [pdf.js](https://mozilla.github.io/pdf.js/).

## Funcionalidades

- **Upload** de um ou mais PDFs (arrastar e soltar ou seleção de arquivo)
- **Importar páginas** de outros PDFs, imagens (PNG/JPG), Word (.docx) ou Excel (.xlsx) — cada arquivo é convertido e anexado como novas páginas ao documento atual
- **Organização de páginas**: reordenar arrastando a miniatura inteira na barra lateral, excluir, duplicar, rotacionar, mesclar vários PDFs em um
- **Cortar página** (crop) com seleção visual da área
- **Texto**: inserir texto novo, ou clicar em um parágrafo existente para editá-lo com **reflow automático** — o texto quebra linha sozinho dentro da caixa original e a caixa cresce/encolhe conforme o conteúdo, tentando reaproveitar a mesma fonte embutida no PDF original (com Helvetica como alternativa quando isso não é possível)
- **Anotações**: realce (highlight), desenho livre, retângulo, círculo, linha, seta e notas adesivas
- **Carimbo**: texto e formatação configuráveis direto no app (não é salvo entre sessões), arraste para carimbar em qualquer página
- **Copiar/colar/duplicar** anotações (Ctrl+C, Ctrl+V, Ctrl+D) e excluir com Delete/Backspace
- **Desfazer** as últimas 10 alterações (Ctrl+Z ou botão "Desfazer")
- **Busca de texto** (Ctrl+F): encontra e destaca ocorrências em todas as páginas, com navegação entre resultados
- **Formulários PDF**: detecta campos de formulário (texto, checkbox, radio, dropdown) e permite preenchê-los antes de exportar
- **Navegação por teclado**: setas ↑/↓ ou Page Up/Page Down avançam e retrocedem páginas
- **Reduzir tamanho do PDF**: recomprime imagens JPEG incorporadas (redimensiona e reduz qualidade) para gerar um arquivo menor
- Rolagem contínua e virtualizada: as páginas aparecem em sequência ao rolar (como no Word/Google Docs); em documentos grandes, páginas distantes da tela não são renderizadas até você chegar perto delas
- Controles de **zoom** (25%–300%)
- Confirmação antes de fechar o documento atual sem baixar ("Novo documento")
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

## Experimento: reflow em cascata (branch `reflow`)

Esta branch é um protótipo separado que substitui o comportamento padrão de edição de parágrafo (que só cresce a caixa por cima do conteúdo, sem afetar o resto da página) por um **reflow em cascata dentro da página**: ao editar um parágrafo e ele crescer ou encolher, todo o conteúdo abaixo dele (outras anotações e o próprio fundo renderizado da página) é empurrado para baixo/cima na mesma proporção — como um documento de verdade, mas limitado a uma única página (não cria nem remove páginas; conteúdo que ultrapassa o fim da página fica cortado).

Como funciona:
- Cada anotação de parágrafo guarda, além da posição/altura atuais (que mudam ao editar), sua posição/altura **originais** (`originalY`/`originalHeight`), capturadas na criação.
- A cada renderização, `src/lib/reflowCascade.ts` calcula o deslocamento acumulado que cada ponto da página deve sofrer, somando o crescimento/encolhimento de todo parágrafo editado acima dele — nunca altera as coordenadas guardadas, só o desenho.
- Na tela, o fundo da página (imagem estática do pdf.js) é recomposto em faixas deslocadas (`src/lib/compositeCascadeBackground.ts`) para que o conteúdo original também pareça se mover.
- Na exportação, páginas sem nenhum parágrafo editado continuam sendo copiadas normalmente (mantendo texto pesquisável/vetorial). Páginas com pelo menos um parágrafo editado são **rasterizadas** (a página original é renderizada em alta resolução, recomposta em faixas deslocadas do mesmo jeito que a pré-visualização, e embutida como imagem de fundo) — as anotações são desenhadas por cima já deslocadas. **Trade-off**: nessas páginas específicas, o conteúdo não editado perde seletibilidade de texto e fidelidade vetorial no PDF final.

Este é um experimento isolado nesta branch, não integrado à branch principal do app.

## Limitações conhecidas

- A edição de texto ainda cobre o parágrafo original com um retângulo e desenha o texto reflowed por cima — a cor desse retângulo é amostrada do próprio fundo da página (não é mais branco fixo), então na maioria dos documentos fica visualmente imperceptível até você editar; mas não empurra o conteúdo abaixo dele na página (reflow "de documento" completo, como um processador de texto, exigiria reconstruir o PDF como um layout fluido, o que está fora do escopo desta ferramenta).
- A fonte é reaproveitada em dois níveis: se o PDF embute o programa da fonte (TrueType/OpenType via `FontFile2`/`FontFile3`), ela é extraída e usada tanto na tela quanto na exportação; se a fonte não é embutida (caso das fontes clássicas Helvetica/Times/Courier, referenciadas só pelo nome), o app identifica a família pelo nome (`/BaseFont`) e usa a variante correspondente (serifada/monoespaçada/sem serifa, com negrito/itálico) em vez de sempre cair em Helvetica.
- O alinhamento original do parágrafo (esquerda, centralizado, direita ou justificado) é detectado pela geometria das linhas e preservado no texto reflowed, tanto na tela quanto na exportação.
- A cor do texto também é reaproveitada: é amostrado o pixel mais distante da cor de fundo dentro da área de um trecho do parágrafo original (ou seja, a "tinta" do texto), em vez de sempre usar preto.
- Um parágrafo com estilos mistos (ex.: uma palavra em negrito no meio de texto normal) é reflowed com uma única fonte/estilo — a distinção por palavra dentro do mesmo parágrafo se perde.
- A detecção de parágrafo, fonte e alinhamento é heurística (baseada em espaçamento/geometria); layouts incomuns (colunas, tabelas, texto rotacionado, fundos com textura/imagem sob o texto) podem ser detectados de forma imperfeita.
- Fontes `Type1` (formato antigo) embutidas não são suportadas para extração; nesse caso o app cai na aproximação por família/nome.
- Texto justificado é desenhado palavra por palavra no PDF exportado (para distribuir o espaçamento); isso faz a busca (que compara por fragmento de texto) não encontrar termos com mais de uma palavra dentro de uma linha justificada — buscar por uma palavra isolada funciona normalmente.
- Anotações em páginas rotacionadas têm sua posição/caixa ajustadas corretamente, mas o texto dentro delas não gira visualmente na tela (a orientação final no PDF exportado segue a posição definida).
- A busca localiza ocorrências dentro de cada fragmento de texto extraído pelo pdf.js; termos que ficam divididos entre dois fragmentos adjacentes (renderizados com fontes/posições diferentes no PDF original) podem não ser encontrados.
- "Reduzir tamanho" só recomprime imagens no formato JPEG (DCTDecode) com espaço de cor não-CMYK — outros formatos de imagem (PNG interno, JPEG2000, digitalizações CCITT) são deixados intactos para evitar risco de corrupção ou distorção de cor.
- Campos de assinatura digital e botões de formulário não são preenchíveis (apenas texto, checkbox, radio e dropdown/lista).
