# Gabinete — Research Assistant

Aplicativo desktop local para acompanhar publicações científicas, receber uma newsletter diária e explorar mapas de referências em revisões de literatura.

## Recursos

- Busca por temas em PubMed e arXiv; acompanhamento de periódicos via Crossref.
- Às 07h, ou ao entrar no Windows/abrir o app, prepara a edição com artigos publicados no dia anterior.
- Filtra a data de publicação e exige evidência dos conceitos no título, resumo ou palavras-chave.
- Deduplicação persistente por DOI, PMID e URL.
- Newsletter por SMTP, histórico de tentativas e proteção contra reenvio da edição já enviada.
- Integração com Zotero, incluindo recuperação de falhas de sincronização.
- Revisões por tema e intervalo de anos em PubMed e Crossref, com critérios editáveis e mapa navegável de citações.
- Exportação JSON e notas Markdown interligadas para Obsidian.

## Instalação

Requer Node.js 24 LTS e npm. Os testes usam bancos em memória e não enviam e-mails nem alteram bibliotecas remotas.

~~~sh
npm ci
~~~

Copie o arquivo de exemplo para a configuração local:

~~~powershell
Copy-Item .env.example .env
~~~

Em macOS/Linux: `cp .env.example .env`.

Depois de preencher a configuração, inicie:

~~~sh
npm start
~~~

A interface abre no Electron. Para usar apenas o servidor local: `npm run server`, acessando `http://127.0.0.1:4141`.

## Configuração

Todas as configurações pessoais ficam no arquivo local `.env`, que é ignorado pelo Git. Este repositório não contém conta de e-mail, senha, chave de API, banco de dados ou histórico de pesquisa preenchidos.

| Variável | Função |
|---|---|
| `PORT` | Porta local, padrão 4141 |
| `TIMEZONE` | Fuso da edição, padrão America/Sao_Paulo |
| `CRON_SCHEDULE` | Horário enquanto o app está aberto, padrão `0 7 * * *` |
| `SMTP_HOST`, `SMTP_PORT` | Servidor SMTP; 465 usa TLS direto, outras portas usam STARTTLS obrigatório |
| `SMTP_USER`, `SMTP_PASS` | Credenciais do seu provedor de e-mail |
| `EMAIL_FROM`, `EMAIL_TO` | Remetente e destinatário, definidos por cada instalação |
| `ZOTERO_API_KEY` | Chave de leitura/escrita para a biblioteca desejada |
| `ZOTERO_LIBRARY_ID` | ID numérico da biblioteca |
| `ZOTERO_LIBRARY_TYPE` | `users` ou `groups` |
| `ZOTERO_COLLECTION_KEY` | Coleção existente opcional |

Para Gmail, use uma senha de aplicativo compatível com a configuração da conta. O botão de verificação SMTP testa conexão/autenticação sem enviar mensagem; aceitação pelo servidor não garante chegada à caixa de entrada.

Crie a chave do Zotero em [Configurações de chaves](https://www.zotero.org/settings/keys). O app informa se há configuração; a confirmação da chave ocorre ao sincronizar. Metadados ficam no banco local; credenciais ficam no `.env`.

## Agendamento no Windows

Execute na pasta do projeto:

~~~powershell
.\\register-daily-task.ps1 -Time '07:00'
~~~

Isso registra `ResearchAssistantDaily`, com gatilhos diário e de entrada do usuário. O computador deve estar ligado e o usuário conectado. Alinhe o horário da tarefa ao `CRON_SCHEDULE`; o horário do Windows e o fuso configurado devem corresponder.

Se a edição de hoje já foi enviada, a execução seguinte não a reenvia. Ao retornar após vários dias desligado, o app cobre o dia imediatamente anterior, sem enviar todos os dias atrasados em lote. A tarefa tenta novamente em falhas recuperáveis; envios sem confirmação SMTP ficam retidos para conferência. `npm run daily` executa a edição pendente e termina.

Para desativar, use o Agendador de Tarefas do Windows. Para rodar o servidor em modo de teste sem os gatilhos automáticos, defina `DISABLE_AUTOMATION=1` no ambiente do processo.

## Relevância e revisão de literatura

Os temas usam conceitos obrigatórios: um conceito por linha e sinônimos separados por `|`. Conceitos diferentes são combinados com E; sinônimos da mesma linha são alternativas. As sugestões usam vocabulário controlado limitado, com algumas equivalências em português/inglês; revise a estratégia para cada tema.

Na revisão, selecione anos inicial/final e até 500 candidatos. O filtro inicial exige todos os conceitos no título; é possível ampliar para resumos/palavras-chave. Cada cartão informa o termo e o campo da correspondência. Compatibilidade textual é triagem, não confirmação de pertinência sem leitura.

O mapa representa citações com DOI disponibilizadas à Crossref, em uma geração de referências. Referências externas são contexto e podem estar fora do período. O grafo tem limites de 1500 pontos e 4000 ligações; há recuperação adicional limitada de referências para candidatos PubMed. Ausência de ligação não significa ausência de citação.

As revisões ficam separadas da newsletter e não enviam e-mail ou sincronizam automaticamente com Zotero. As exportações incluem toda a revisão salva, independentemente do filtro visual. Extraia o ZIP de notas e abra a pasta como cofre no Obsidian, ou copie as notas para seu cofre existente.

## Dados locais e privacidade

O app cria `data.sqlite` na pasta do projeto. Temas, artigos, leituras, revisões e registros de envio são pessoais e não devem ser adicionados ao Git. Resultados antigos sem confirmação de tema ficam preservados, com opção explícita para conferência do histórico. Artigos já enviados ou sincronizados não são retirados retroativamente.

As consultas científicas vão às bases selecionadas; metadados são enviados ao Zotero quando configurado e a newsletter ao servidor SMTP configurado. O servidor da interface escuta apenas em `127.0.0.1`. Não exponha essa interface diretamente à internet: esta versão não inclui autenticação multiusuário.

## Desenvolvimento e testes

~~~sh
npm test
~~~

Os testes cobrem data de publicação, DOI/PMID, correspondência de temas, falhas SMTP, recuperação de sincronização, filtros do histórico, mapas e exportação de notas.

## Limitações

Atrasos de indexação e metadados sem dia completo podem omitir artigos da seleção diária. arXiv usa a data inicial em UTC. O modo diário não amplia silenciosamente para dias anteriores quando não encontra resultados. Consultas excessivamente grandes exigem refinar o tema. Esta ferramenta apoia exploração e triagem; não substitui uma revisão sistemática exaustiva ou leitura crítica.

## Licença

MIT. Veja [LICENSE](LICENSE).
