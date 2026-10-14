#!/bin/sh
# Gera/atualiza o projeto iOS e aplica o que o Capacitor não faz sozinho:
# textos de permissão da Saúde, capacidade HealthKit, encriptação isenta e nome no ecrã.
set -e
cd "$(dirname "$0")/.."

[ -d ios ] || npx cap add ios
npx @capacitor/assets generate --ios --iconBackgroundColor '#0f766e' --splashBackgroundColor '#f5f7fa' --splashBackgroundColorDark '#0b1220'
npx cap sync ios

PLIST=ios/App/App/Info.plist
pb() { /usr/libexec/PlistBuddy -c "$1" "$PLIST" 2>/dev/null || true; }
pb "Delete :NSHealthShareUsageDescription"
pb "Add :NSHealthShareUsageDescription string A Taking care lê da app Saúde as calorias ativas e basais, passos, minutos de exercício, sono, frequência cardíaca em repouso, variabilidade cardíaca, peso e treinos para calcular o seu gasto energético, o défice do dia e mostrar o seu progresso. Os dados não são usados para publicidade."
pb "Delete :ITSAppUsesNonExemptEncryption"
pb "Add :ITSAppUsesNonExemptEncryption bool false"
pb "Delete :CFBundleDisplayName"
pb "Add :CFBundleDisplayName string Taking care"
pb "Delete :UISupportedInterfaceOrientations"
pb "Add :UISupportedInterfaceOrientations array"
pb "Add :UISupportedInterfaceOrientations:0 string UIInterfaceOrientationPortrait"

# Capacidade HealthKit (o identificador da app no portal Apple tem de ter HealthKit ativo)
cat > ios/App/App/App.entitlements <<'XML'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>com.apple.developer.healthkit</key>
  <true/>
  <key>com.apple.developer.healthkit.access</key>
  <array/>
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
echo "iOS pronto"
