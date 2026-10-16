# App nativa (iOS / Android)

A app nativa abre o site `https://takingcare.pt` (Capacitor, `server.url`) e acrescenta funções do telemóvel:
leitura da **Apple Saúde** (iPhone) e do **Health Connect** (Android) com `@capgo/capacitor-health`.
As alterações ao site aparecem logo na app; só mudanças nativas (plugins, permissões, ícones) precisam de novo build e revisão.

O site deteta a app com `window.Capacitor` (ver `src/lib/nativeHealthClient.ts`). Dentro da app, o Perfil mostra
"Ligar a Apple Saúde" e o ecrã Hoje sincroniza os últimos 7 dias ao abrir (no máximo de 30 em 30 minutos).

## iOS sem Mac — Codemagic

1. **Apple Developer** → Certificates, Identifiers & Profiles → Identifiers → **+** → App IDs → App
   - Bundle ID (explícito): `com.zamoriane.takingcare`
   - Capabilities: marcar **HealthKit**
2. **App Store Connect** → Apps → **+** → Nova app
   - Plataforma iOS · Nome "Taking care of yourself" · Idioma principal Português (Portugal)
   - Bundle ID `com.zamoriane.takingcare` · SKU `takingcare001`
   - Copiar o **Apple ID** numérico da app (Informações da app) para `APP_STORE_APPLE_ID` em `codemagic.yaml`.
3. **App Store Connect** → Users and Access → Integrations → App Store Connect API → **+**
   - Nome "Codemagic", acesso **App Manager** → descarregar o ficheiro `.p8` (só se descarrega uma vez) e anotar Issuer ID e Key ID.
4. **Codemagic** (codemagic.io, entrar com o GitHub) → Team settings → Integrations → Developer Portal → **Manage keys**
   - Nome da chave: `takingcare-asc` · Issuer ID · Key ID · ficheiro `.p8`.
5. **Codemagic** → Add application → repositório `zamoriane/dieta-macros` → tipo "codemagic.yaml".
6. Iniciar o build: **Start new build** → workflow "iOS → TestFlight" (ou criar uma tag `ios-v1.0.0` no GitHub).
7. ~20 min depois a versão aparece no **TestFlight**: instalar a app TestFlight no iPhone e testar.

## Antes de enviar para revisão

- Conta de demonstração com dados para o revisor (ver `supabase/seeds/`).
- Notas para o revisor: a Saúde serve para calcular o gasto energético e o défice; o modo treinador; apagar conta em Perfil → Conta e segurança.
- Privacidade: `https://takingcare.pt/privacidade`.
