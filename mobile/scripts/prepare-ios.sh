#!/bin/sh
# Gera/atualiza o projeto iOS e aplica o que o Capacitor não faz sozinho:
# textos de permissão da Saúde, capacidade HealthKit, encriptação isenta e nome no ecrã.
set -e
cd "$(dirname "$0")/.."

[ -d ios ] || npx cap add ios
npx @capacitor/assets generate --ios --iconBackgroundColor '#016162' --splashBackgroundColor '#f5f7fa' --splashBackgroundColorDark '#0b1220'
npx cap sync ios

PLIST=ios/App/App/Info.plist
pb() { /usr/libexec/PlistBuddy -c "$1" "$PLIST" 2>/dev/null || true; }
pb "Delete :NSHealthShareUsageDescription"
pb "Add :NSHealthShareUsageDescription string A Taking care lê da app Saúde as calorias ativas e basais, passos, minutos de exercício, sono, frequência cardíaca em repouso, variabilidade cardíaca, peso e treinos para calcular o seu gasto energético, o défice do dia e mostrar o seu progresso. Os dados não são usados para publicidade."
# Exigido pela Apple porque o plugin de Saúde inclui funções de escrita (a app só lê).
pb "Delete :NSHealthUpdateUsageDescription"
pb "Add :NSHealthUpdateUsageDescription string A Taking care só lê dados da app Saúde para calcular o seu gasto energético e progresso. Não escreve nem altera dados na app Saúde."
pb "Delete :ITSAppUsesNonExemptEncryption"
pb "Add :ITSAppUsesNonExemptEncryption bool false"
pb "Delete :CFBundleDisplayName"
pb "Add :CFBundleDisplayName string Taking care"
pb "Delete :UISupportedInterfaceOrientations"
pb "Add :UISupportedInterfaceOrientations array"
pb "Add :UISupportedInterfaceOrientations:0 string UIInterfaceOrientationPortrait"

# Login Google nativo: esquema de URL = ID do cliente iOS invertido
GOOGLE_IOS_SCHEME="com.googleusercontent.apps.498189332281-mpq4h0pcgdhlabv6nd476rmh8ucntjfg"
pb "Delete :CFBundleURLTypes"
pb "Add :CFBundleURLTypes array"
pb "Add :CFBundleURLTypes:0 dict"
pb "Add :CFBundleURLTypes:0:CFBundleURLSchemes array"
pb "Add :CFBundleURLTypes:0:CFBundleURLSchemes:0 string $GOOGLE_IOS_SCHEME"

# AppDelegate: o template do Capacitor 8 usa SceneDelegate e o GoogleSignIn (iOS 13+) usa
# ASWebAuthenticationSession, que não precisa do regresso por URL. Só se aplica a templates antigos.
python3 - <<'PY'
p = "ios/App/App/AppDelegate.swift"
s = open(p).read()
old = "return ApplicationDelegateProxy.shared.application(app, open: url, options: options)"
if "GIDSignIn" not in s and old in s:
    s = s.replace("import Capacitor", "import Capacitor\n#if canImport(GoogleSignIn)\nimport GoogleSignIn\n#endif", 1)
    new = "#if canImport(GoogleSignIn)\n        if GIDSignIn.sharedInstance.handle(url) { return true }\n        #endif\n        " + old
    s = s.replace(old, new, 1)
    open(p, "w").write(s)
    print("AppDelegate: GoogleSignIn ligado")
else:
    print("AppDelegate: sem alterações (template com SceneDelegate)")
PY

# Capacidades HealthKit e Sign in with Apple (ambas ativas no identificador da app no portal Apple)
cat > ios/App/App/App.entitlements <<'XML'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>com.apple.developer.healthkit</key>
  <true/>
  <key>com.apple.developer.healthkit.access</key>
  <array/>
  <key>com.apple.developer.applesignin</key>
  <array>
    <string>Default</string>
  </array>
</dict>
</plist>
XML
ruby -e '
require "xcodeproj"
p = Xcodeproj::Project.open("ios/App/App.xcodeproj")
t = p.targets.find { |x| x.name == "App" }
t.build_configurations.each do |c|
  c.build_settings["CODE_SIGN_ENTITLEMENTS"] = "App/App.entitlements"
  c.build_settings["TARGETED_DEVICE_FAMILY"] = "1"
end
p.save
'
ruby scripts/prepare-victus-ios.rb
echo "iOS pronto (inclui Victus)"
