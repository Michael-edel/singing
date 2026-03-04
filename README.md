# singing
Игра для Вокальной Студии Jivoi Zvuk.

## Cloudflare deployment

В репозиторий добавлена конфигурация `wrangler.toml`, чтобы Cloudflare Worker/Pages видел проект и не падал с ошибкой про отсутствие `wrangler.json/wrangler.toml`.

### Вариант 1 (рекомендуется): Cloudflare Pages
1. В Cloudflare: **Workers & Pages → Create → Pages → Connect to Git**.
2. Выберите репозиторий `singing`.
3. Build settings:
   - **Framework preset**: `Vite`
   - **Build command**: `npm run build`
   - **Build output directory**: `dist`
4. Deploy.

### Вариант 2: Cloudflare Workers (как на скриншоте)
Теперь это работает, т.к. в корне есть `wrangler.toml` и Worker entrypoint:
- `wrangler.toml`
- `cloudflare/worker.js`

Локально (при доступе к npm):
```bash
npm install
npm run build
npm run cf:deploy
```

### Почему раньше была ошибка
На скриншоте Cloudflare запускал сценарий деплоя Worker из репозитория, но в репозитории не было `wrangler.toml`/`wrangler.json`. Поэтому и появлялось сообщение:
> Could not find a wrangler.json, wrangler.jsonc, or wrangler.toml file in the provided directory.
