# Деплой Roost на VPS (reg.ru)

Инструкция для сервера с **Ubuntu 22.04/24.04** (reg.ru обычно даёт именно его).
Есть два пути — выбери один:

- **Путь A — Docker** (проще всего, рекомендую). Одна команда, ничего не ставим руками.
- **Путь B — вручную** (Node + systemd + nginx). Больше контроля.

В конце — как навести домен и включить HTTPS, и как подключить ПК-приложение.

> Примечание: сам продукт называется **Roost**, но репозиторий на GitHub пока
> называется `Felar` — поэтому в командах `git clone` ниже адрес именно
> `.../Felar.git`. Если переименуешь репозиторий в настройках GitHub на `Roost`,
> замени в URL `Felar` → `Roost`.

---

## 0. Подключение к серверу

Из панели reg.ru возьми IP сервера, root-пароль (или добавь SSH-ключ). Затем:

```bash
ssh root@ТВОЙ_IP
```

Обнови систему:

```bash
apt update && apt upgrade -y
```

> «Удалить старую фигню»: если на сервере крутится что-то лишнее — проверь
> `docker ps -a` (старые контейнеры) и `systemctl list-units --type=service`.
> Удалить контейнеры: `docker rm -f <имя>`. Остановить сервис:
> `systemctl disable --now <имя>`. Если совсем чистый старт — можно в панели
> reg.ru **переустановить ОС** и начать с нуля.

---

## Путь A — Docker (рекомендуется)

### A1. Установить Docker

```bash
curl -fsSL https://get.docker.com | sh
```

### A2. Забрать код

```bash
apt install -y git
git clone https://github.com/tombirdi732-cloud/Felar.git /opt/roost
cd /opt/roost
git checkout claude/discord-like-messenger-qisejt
```

### A3. Запустить (по IP, без домена — для проверки)

```bash
JWT_SECRET=$(openssl rand -hex 32) docker compose up -d --build
```

Готово. Открой в браузере `http://ТВОЙ_IP:3000` — увидишь экран входа.
База лежит в Docker-томе `roost-data` и переживает перезапуски.

Полезное:

```bash
docker compose logs -f      # логи
docker compose restart      # перезапуск
docker compose down         # остановить
```

### A4. Домен + HTTPS (когда будет домен)

См. раздел **«Домен и HTTPS»** ниже — для Docker используется
`deploy/docker-compose.caddy.yml` (SSL включается сам).

---

## Путь B — вручную (Node + systemd + nginx)

### B1. Установить Node 22

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
apt install -y nodejs git nginx
```

### B2. Код и зависимости

```bash
git clone https://github.com/tombirdi732-cloud/Felar.git /opt/roost
cd /opt/roost
git checkout claude/discord-like-messenger-qisejt
npm ci --omit=dev
mkdir -p data
```

### B3. Настройки окружения

```bash
cp .env.example .env
# впиши свой JWT_SECRET:
sed -i "s|change-me-to-a-long-random-string|$(openssl rand -hex 32)|" .env
```

### B4. Отдельный пользователь и автозапуск

```bash
useradd -r -s /usr/sbin/nologin roost || true
chown -R roost:roost /opt/roost
cp deploy/roost.service /etc/systemd/system/roost.service
systemctl daemon-reload
systemctl enable --now roost
systemctl status roost        # должно быть active (running)
```

Сервер слушает `127.0.0.1:3000`. Дальше — nginx наружу.

### B5. nginx

```bash
cp deploy/nginx.conf /etc/nginx/sites-available/roost
# заменить roost.example.com на свой домен (или _ для доступа по IP):
nano /etc/nginx/sites-available/roost
ln -s /etc/nginx/sites-available/roost /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx
```

Теперь `http://ТВОЙ_IP/` открывает Roost.

Обновление кода в будущем:

```bash
cd /opt/roost && git pull && npm ci --omit=dev && systemctl restart roost
```

---

## Домен и HTTPS

HTTPS обязателен для нормальной работы (иначе браузеры ругаются, а WebSocket
по `wss://` не пойдёт со страницы `https://`).

### 1. Привязать домен

Домен можно купить там же на reg.ru. В DNS-настройках домена создай
**A-запись**, указывающую на IP сервера:

```
Тип: A   Хост: @    Значение: ТВОЙ_IP
Тип: A   Хост: www  Значение: ТВОЙ_IP
```

Подожди 10–60 минут, пока DNS обновится (проверка: `ping твойдомен`).

### 2а. HTTPS для Docker (Путь A)

```bash
cd /opt/roost
DOMAIN=roost.твойдомен.ru EMAIL=твоя@почта.ru JWT_SECRET=$(openssl rand -hex 32) \
  docker compose -f deploy/docker-compose.caddy.yml up -d --build
```

Caddy сам получит и будет продлевать сертификат Let's Encrypt.
Открывай `https://roost.твойдомен.ru`.

### 2б. HTTPS для ручного пути (Путь B)

```bash
apt install -y certbot python3-certbot-nginx
certbot --nginx -d roost.твойдомен.ru
```

certbot сам пропишет SSL в конфиг nginx и настроит автопродление.

---

## Firewall (если включён)

Открой нужные порты:

```bash
ufw allow OpenSSH
ufw allow 80
ufw allow 443
# только если запускаешь по IP без домена (Путь A3):
ufw allow 3000
ufw enable
```

---

## Подключение ПК-приложения к серверу

В приложении Roost на экране входа нажми **«Настройки сервера»** и впиши адрес
своего сервера:

- с доменом и HTTPS: `https://roost.твойдомен.ru`
- по IP для теста: `http://ТВОЙ_IP:3000`

Адрес сохранится. Дальше — регистрация/вход и общение.

> Важно: если приложение раздаётся как `https://`, то и адрес сервера должен быть
> `https://` (смешивать http/https браузер не даст).

---

## Быстрый чеклист

- [ ] Сервер обновлён, старое удалено
- [ ] Docker **или** Node+nginx установлены
- [ ] Репозиторий склонирован в `/opt/roost`, ветка переключена
- [ ] Задан длинный случайный `JWT_SECRET`
- [ ] Приложение отвечает по IP:3000 (или по домену)
- [ ] A-запись домена указывает на IP
- [ ] Включён HTTPS (Caddy или certbot)
- [ ] В ПК-приложении прописан адрес сервера
