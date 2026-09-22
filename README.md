# Escalonador — Simulador Educacional de Escalonamento de CPU

Simulador web de algoritmos de escalonamento de processos, feito para alunos
de Sistemas Operacionais visualizarem, na prática, como cada algoritmo decide
qual processo usa a CPU e por quanto tempo.

Puro HTML/CSS/JS — sem build step, sem backend, sem login. Basta abrir
`index.html` no navegador.

## Como rodar

Abra `index.html` diretamente no navegador, ou sirva a pasta com qualquer
servidor estático (opcional, útil para evitar restrições de `file://` em
alguns navegadores):

```bash
python3 -m http.server 8000
# depois acesse http://localhost:8000
```

## Estrutura do projeto

```
.
├── index.html                 # Simulador — painéis, tabelas, Gantt
├── docs/                       # Páginas independentes, uma por algoritmo
│   ├── fcfs.html
│   ├── sjf.html
│   ├── srtf.html
│   ├── round-robin.html
│   ├── priority-np.html
│   └── priority-p.html
├── css/
│   ├── style.css                # Visual do simulador: tema claro/escuro, componentes
│   ├── layout.css                # Shell de duas colunas (sidebar + conteúdo), usado por todas as páginas
│   └── docs.css                   # Tipografia e componentes das páginas de explicação
├── js/
│   ├── engine.js                  # Algoritmos de escalonamento — lógica pura, sem DOM
│   ├── sidebar.js                  # Navegação lateral compartilhada por index.html e docs/*.html
│   └── app.js                       # Estado do simulador, renderização e controles
└── README.md
```

**`engine.js`** não sabe que existe uma página HTML. Cada algoritmo é uma
função que recebe uma lista de processos (e, quando aplicável, o quantum) e
devolve um objeto `{ segments, stats }`:

- `segments`: fatias contíguas de execução — `{ pid, start, end }`
- `stats`: por processo — horário de chegada, duração, início e término

Isso permite reaproveitar ou testar os algoritmos isoladamente (ex.: em
testes automatizados ou em outra interface) sem tocar em `app.js`. O array
`ALGOS` em `engine.js` também é a fonte única de verdade para nome, descrição
e `slug` de cada algoritmo — tanto o seletor do simulador quanto a barra
lateral (`sidebar.js`) leem dali, então adicionar um algoritmo novo não exige
editar a navegação à mão.

**`app.js`** guarda o estado (lista de processos, algoritmo selecionado,
quantum, posição da linha do tempo) e é responsável por toda a renderização
e pelos controles de reprodução (play/pause/passo/reset/velocidade). Ele
também lê um parâmetro `?algo=<id>` na URL para pré-selecionar o algoritmo —
é assim que os botões "Testar no simulador" das páginas de `docs/` abrem o
simulador já no algoritmo certo.

**`sidebar.js`** renderiza a navegação lateral (link para o simulador + um
link por algoritmo) tanto em `index.html` quanto em cada página de `docs/`,
destacando o item ativo. Como cada página HTML em `docs/` é independente
(pode ser aberta e compartilhada sozinha), a sidebar é montada via
JavaScript em vez de duplicar HTML manualmente em seis arquivos.

## Algoritmos implementados

| Algoritmo | Preemptivo | Critério de escolha |
|---|---|---|
| FCFS (First-Come, First-Served) | Não | Ordem de chegada |
| SJF (Shortest Job First) | Não | Menor duração total |
| SRTF (Shortest Remaining Time First) | Sim | Menor tempo restante |
| Round-Robin | Sim (por quantum) | Fila circular, fatia de tempo fixa |
| Prioridade | Não | Menor número de prioridade = mais prioritário |
| Prioridade Preemptiva | Sim | Idem, reavaliado a cada chegada |

Critérios de desempate (em todos os algoritmos): horário de chegada e, em
seguida, ordem de inserção do processo — garantindo resultado determinístico.

## Métricas calculadas

- Tempo médio de espera (*waiting time*)
- Tempo médio de retorno (*turnaround time*)
- Vazão (*throughput* — processos concluídos por unidade de tempo)
- Makespan (tempo total até o último processo terminar)

## Fora do escopo do MVP

Por decisão de projeto (ver `docs/prompt.md`, se incluído): gerência de
memória, sistemas de arquivos, sincronização de processos/semáforos e
multithreading não fazem parte deste simulador, o foco é exclusivamente
visualizar o escalonamento de CPU.

## Extendendo

Para adicionar um novo algoritmo:

1. Escreva a função de simulação em `engine.js` (reaproveite
   `simulateNonPreemptive` ou `simulateTickPreemptive` quando possível, ou
   escreva uma nova função no estilo de `simulateRR`).
2. Registre-o no array `ALGOS` (rótulo e descrição em português).
3. Adicione o `case` correspondente em `runSchedule`.

Nenhuma mudança em `app.js` é necessária além disso — a UI lê `ALGOS`
dinamicamente.

Para adicionar a página de explicação correspondente, copie um dos arquivos
em `docs/` como modelo, ajuste o conteúdo e o `current` passado a
`initSidebar(...)` para o novo `slug` — a sidebar já vai linkar para ela
automaticamente a partir do `ALGOS` atualizado.
