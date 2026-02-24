import React, { useState } from 'react';
import { Calculator, Clock, Zap, AlertTriangle, ToggleLeft, ToggleRight, Save, Upload, Download, Trash2, Info } from 'lucide-react';

function JobBerechnung({ label, isComparison, profileToLoad }) {
  const [eingabeArt, setEingabeArt] = useState('monat');
  const [lohnWert, setLohnWert] = useState('4500');
  const [steuerklasse, setSteuerklasse] = useState('1');
  const [partnerBrutto, setPartnerBrutto] = useState('');
  const [kinder, setKinder] = useState('0');
  const [bundesland, setBundesland] = useState('NW');
  const [kirchensteuer, setKirchensteuer] = useState('nein');
  const [kvZusatz, setKvZusatz] = useState('2.9');
  const [geburtsjahr, setGeburtsjahr] = useState('1989');
  const [wochenstunden, setWochenstunden] = useState('40');
  const [fahrtzeitHin, setFahrtzeitHin] = useState('30');
  const [fahrtzeitZurueck, setFahrtzeitZurueck] = useState('30');
  const [arbeitstage, setArbeitstage] = useState('5');
  const [ueberstundenBonus, setUeberstundenBonus] = useState('25');
  const [ueberstundenAnzahl, setUeberstundenAnzahl] = useState('10');
  const [stundenlohnMitPartnerAnpassung, setStundenlohnMitPartnerAnpassung] = useState(true);
  
  // Profil laden
  React.useEffect(() => {
    if (profileToLoad) {
      const d = profileToLoad;
      setEingabeArt(d.eingabeArt || 'monat');
      setLohnWert(d.lohnWert || '4500');
      setSteuerklasse(d.steuerklasse || '1');
      setPartnerBrutto(d.partnerBrutto || '');
      setKinder(d.kinder || '0');
      setBundesland(d.bundesland || 'NW');
      setKirchensteuer(d.kirchensteuer || 'nein');
      setKvZusatz(d.kvZusatz || '2.9');
      setGeburtsjahr(d.geburtsjahr || '1989');
      setWochenstunden(d.wochenstunden || '40');
      setFahrtzeitHin(d.fahrtzeitHin || '30');
      setFahrtzeitZurueck(d.fahrtzeitZurueck || '30');
      setArbeitstage(d.arbeitstage || '5');
      setUeberstundenBonus(d.ueberstundenBonus || '25');
      setUeberstundenAnzahl(d.ueberstundenAnzahl || '10');
      setStundenlohnMitPartnerAnpassung(d.stundenlohnMitPartnerAnpassung !== undefined ? d.stundenlohnMitPartnerAnpassung : true);
    }
  }, [profileToLoad]);

  // Brutto berechnen
  let bruttoMonat;
  if (eingabeArt === 'monat') bruttoMonat = parseFloat(lohnWert);
  else if (eingabeArt === 'jahr') bruttoMonat = parseFloat(lohnWert) / 12;
  else bruttoMonat = parseFloat(lohnWert) * parseFloat(wochenstunden) * 4.33;

  const bruttoJahr = bruttoMonat * 12;
  const alter = 2026 - parseInt(geburtsjahr);
  const bbgKVPV = 5812.50;
  const bbgRVAV = 8450;

  // ECHTE Sozialversicherungen (für die Abzüge)
  const kv = Math.min(bruttoMonat, bbgKVPV) * (0.073 + parseFloat(kvZusatz) / 100 / 2);
  const pv = Math.min(bruttoMonat, bbgKVPV) * (bundesland === 'SN' 
    ? (alter < 23 || parseInt(kinder) > 0 ? 0.020 : 0.026)
    : (alter < 23 || parseInt(kinder) > 0 ? 0.012 : 0.024));
  const rv = Math.min(bruttoMonat, bbgRVAV) * 0.093;
  const av = Math.min(bruttoMonat, bbgRVAV) * 0.013;
  const gesamtSV = kv + pv + rv + av;

  // LOHNSTEUER mit korrekter Vorsorgepauschale
  const grundfreibetrag = 12348;
  
  // Vorsorgepauschale für Steuerberechnung (NICHT die echten SV-Beiträge!)
  const vsp_rv = Math.min(bruttoJahr, bbgRVAV * 12) * 0.093;
  const vsp_kv = Math.min(bruttoJahr, bbgKVPV * 12) * ((14.6 - 4.0 + parseFloat(kvZusatz)) / 2 / 100);
  const vsp_pv = Math.min(bruttoJahr, bbgKVPV * 12) * (alter < 23 || parseInt(kinder) > 0 ? 0.012 : 0.024);
  const vsp_alv = Math.min(bruttoJahr, bbgRVAV * 12) * 0.013;
  const vsp_gesamt = vsp_rv + vsp_kv + vsp_pv + vsp_alv;

  // Zu versteuerndes Einkommen
  const werbungskosten = 1230;
  const sonderausgaben = 36;
  const zveRoh = bruttoJahr - werbungskosten - sonderausgaben - vsp_gesamt;
  const zvE = Math.floor(zveRoh / 432) * 432; // Abrunden auf /432

  function berechneESt(zvE) {
    if (zvE <= grundfreibetrag) return 0;
    const x = zvE - grundfreibetrag;
    let est = 0;
    if (x <= 11604) {
      const y = x / 10000;
      est = (922.98 * y + 1400) * y;
    } else if (x <= 17005) {
      const y = (x - 11604) / 10000;
      est = (181.19 * y + 2397) * y + 1025.38;
    } else if (x <= 66760) {
      const z = (x - 17005) / 10000;
      est = (0.42 * z + 0.2397) * z * 10000 + 1025.38 + 2397 * 0.054016 + 181.19 * 0.054016 * 0.054016;
    } else if (x <= 277825) {
      est = 0.42 * x - 10602.13;
    } else {
      est = 0.45 * x - 18936.88;
    }
    return Math.max(0, est);
  }

  let jahresLSt = 0;
  let partnerMehrsteuer = 0;
  let ichSpare = 0;
  let gesamtVorteilNachteil = 0;

  if (steuerklasse === '1' || steuerklasse === '4') {
    jahresLSt = berechneESt(zvE);
  } else if (steuerklasse === '2') {
    const entl = 4260 + Math.max(0, parseInt(kinder) - 1) * 240;
    jahresLSt = berechneESt(Math.max(0, zvE - entl));
  } else if (steuerklasse === '3') {
    const zvESplitting = zvE / 2;
    jahresLSt = berechneESt(zvESplitting) * 2;
    const ichStKl4 = berechneESt(zvE);
    ichSpare = ichStKl4 - jahresLSt;

    if (partnerBrutto && parseFloat(partnerBrutto) > 0) {
      const partnerMonat = parseFloat(partnerBrutto);
      const partnerJahr = partnerMonat * 12;
      
      // Partner VSP (gleiche Formel wie für Hauptperson)
      const partnerVspRv = Math.min(partnerJahr, bbgRVAV * 12) * 0.093;
      const partnerVspKv = Math.min(partnerJahr, bbgKVPV * 12) * ((14.6 - 4.0 + parseFloat(kvZusatz)) / 2 / 100);
      const partnerVspPv = Math.min(partnerJahr, bbgKVPV * 12) * 0.024; // kinderlos angenommen
      const partnerVspAlv = Math.min(partnerJahr, bbgRVAV * 12) * 0.013;
      const partnerVsp = partnerVspRv + partnerVspKv + partnerVspPv + partnerVspAlv;
      
      const partnerZveRoh = partnerJahr - werbungskosten - sonderausgaben - partnerVsp;
      const partnerZvE = Math.floor(partnerZveRoh / 432) * 432;
      
      // Partner mit StKl 4: Normale Berechnung mit Grundfreibetrag
      const partnerStKl4 = berechneESt(partnerZvE);
      
      // Partner mit StKl 5: OHNE Grundfreibetrag! (Das ist der Unterschied!)
      const partnerStKl5 = berechneESt(partnerZvE + grundfreibetrag);
      
      // Partner-Mehrsteuer = Differenz zwischen StKl 5 und StKl 4
      partnerMehrsteuer = partnerStKl5 - partnerStKl4;
      
      // Gesamt-Effekt für das Paar
      gesamtVorteilNachteil = ichSpare - partnerMehrsteuer;
    }
  } else if (steuerklasse === '5' || steuerklasse === '6') {
    jahresLSt = berechneESt(zvE + grundfreibetrag);
  }

  const soliGrenze = steuerklasse === '3' ? 35086 : 17543;
  let jahresSoli = 0;
  if (jahresLSt > soliGrenze) {
    jahresSoli = Math.min((jahresLSt - soliGrenze) * 0.119, jahresLSt * 0.055);
  }

  const kstSatz = ['BW', 'BY'].includes(bundesland) ? 0.08 : 0.09;
  const jahresKSt = kirchensteuer === 'ja' ? jahresLSt * kstSatz : 0;

  const monatLSt = jahresLSt / 12;
  const monatSoli = jahresSoli / 12;
  const monatKSt = jahresKSt / 12;

  const nettoMonat = bruttoMonat - gesamtSV - monatLSt - monatSoli - monatKSt;
  const nettoJahr = nettoMonat * 12;
  
  const effektivesNettoMonat = steuerklasse === '3' && partnerMehrsteuer > 0 
    ? nettoMonat - (partnerMehrsteuer / 12) 
    : nettoMonat;
  const effektivesNettoJahr = effektivesNettoMonat * 12;

  const monatsstunden = parseFloat(wochenstunden) * 4.33;
  
  // Stundenlöhne - mit Toggle für Partner-Anpassung
  const nettoFuerStundenlohn = (stundenlohnMitPartnerAnpassung && steuerklasse === '3' && partnerMehrsteuer > 0) 
    ? effektivesNettoMonat 
    : nettoMonat;
  
  const nettoStunde = nettoFuerStundenlohn / monatsstunden;
  const bruttoStunde = bruttoMonat / monatsstunden;
  
  const fahrtzeitWoche = (parseFloat(fahrtzeitHin) + parseFloat(fahrtzeitZurueck)) * parseFloat(arbeitstage);
  const fahrtzeitMonat = (fahrtzeitWoche / 60) * 4.33;
  const gesamtZeit = monatsstunden + fahrtzeitMonat;
  const bereinigterStunde = nettoFuerStundenlohn / gesamtZeit;

  const bonusFaktor = 1 + parseFloat(ueberstundenBonus) / 100;
  const bruttoUeberstunde = bruttoStunde * bonusFaktor;
  const stundenAnzahl = parseFloat(ueberstundenAnzahl);
  
  // RICHTIGE Überstunden-Berechnung: Was bleibt von der NÄCHSTEN Stunde?
  
  // 1. SV-Abzüge (echte Sätze, nicht VSP!)
  const svSatzGesamt = (kv + pv + rv + av) / bruttoMonat;
  const svProUeberstunde = bruttoUeberstunde * svSatzGesamt;
  
  // 2. Grenzsteuersatz berechnen (was kostet der NÄCHSTE Euro?)
  // Teste zvE und zvE + 1000€, rechne Differenz aus
  const testBetrag = 1000; // 1000€ zusätzlich
  const zvEPlus = zvE + testBetrag;
  
  let steuernOhne = 0;
  let steuernMit = 0;
  
  if (steuerklasse === '1' || steuerklasse === '4') {
    steuernOhne = berechneESt(zvE);
    steuernMit = berechneESt(zvEPlus);
  } else if (steuerklasse === '3') {
    steuernOhne = berechneESt(zvE / 2) * 2;
    steuernMit = berechneESt(zvEPlus / 2) * 2;
  } else if (steuerklasse === '2') {
    const entl = 4260 + Math.max(0, parseInt(kinder) - 1) * 240;
    steuernOhne = berechneESt(Math.max(0, zvE - entl));
    steuernMit = berechneESt(Math.max(0, zvEPlus - entl));
  } else {
    steuernOhne = berechneESt(zvE + grundfreibetrag);
    steuernMit = berechneESt(zvEPlus + grundfreibetrag);
  }
  
  const grenzsteuersatz = (steuernMit - steuernOhne) / testBetrag;
  
  // 3. Was bleibt von einer Überstunde NETTO?
  // Brutto - SV - Grenzsteuer (auf Jahresbasis, dann /12)
  const steuernProUeberstundeJahr = bruttoUeberstunde * 12 * grenzsteuersatz;
  const steuernProUeberstundeMonat = steuernProUeberstundeJahr / 12;
  
  // Soli auf Grenzsteuersatz
  let soliProUeberstunde = 0;
  if (jahresLSt > soliGrenze) {
    soliProUeberstunde = steuernProUeberstundeMonat * 0.055;
  }
  
  const nettoProUeberstunde = bruttoUeberstunde - svProUeberstunde - steuernProUeberstundeMonat - soliProUeberstunde;
  
  // Gesamt für alle Überstunden
  const bruttoUeberstundenGesamt = stundenAnzahl * bruttoUeberstunde;
  const nettoUeberstunden = stundenAnzahl * nettoProUeberstunde;
  const svAufUeberstunden = stundenAnzahl * svProUeberstunde;
  const steuernAufUeberstunden = stundenAnzahl * (steuernProUeberstundeMonat + soliProUeberstunde);
  
  // Effektiver Bonus basiert auf dem gewählten Netto (mit/ohne Partner-Anpassung)
  const nettoStundeVergleich = nettoFuerStundenlohn / monatsstunden;
  const effektiverBonus = ((nettoProUeberstunde / nettoStundeVergleich) - 1) * 100;

  const getCurrentProfile = () => ({
    eingabeArt, lohnWert, steuerklasse, partnerBrutto,
    kinder, bundesland, kirchensteuer, kvZusatz, geburtsjahr,
    wochenstunden, fahrtzeitHin, fahrtzeitZurueck, arbeitstage,
    ueberstundenBonus, ueberstundenAnzahl, stundenlohnMitPartnerAnpassung
  });

  return (
    <div className="space-y-6">
      {/* Eingabe */}
      <div className="bg-white rounded-xl shadow-lg p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-xl font-bold text-gray-800">{label}</h3>
          <button
            onClick={() => window.dispatchEvent(new CustomEvent('saveProfile', { detail: { label, data: getCurrentProfile() } }))}
            className="flex items-center gap-2 px-3 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold rounded-lg transition-colors"
          >
            <Save className="w-4 h-4" />
            Speichern
          </button>
        </div>
        
        <div className="grid md:grid-cols-3 gap-4 mb-4">
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">Eingabe als</label>
            <select value={eingabeArt} onChange={(e) => setEingabeArt(e.target.value)} className="w-full px-3 py-2 border-2 border-gray-300 rounded-lg focus:border-indigo-500 focus:outline-none">
              <option value="monat">€ / Monat</option>
              <option value="jahr">€ / Jahr</option>
              <option value="stunde">€ / Stunde</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">Betrag</label>
            <input type="number" value={lohnWert} onChange={(e) => setLohnWert(e.target.value)} className="w-full px-3 py-2 border-2 border-gray-300 rounded-lg focus:border-indigo-500 focus:outline-none" />
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">Steuerklasse</label>
            <select value={steuerklasse} onChange={(e) => setSteuerklasse(e.target.value)} className="w-full px-3 py-2 border-2 border-gray-300 rounded-lg focus:border-indigo-500 focus:outline-none">
              <option value="1">I - Ledig</option>
              <option value="2">II - Alleinerziehend</option>
              <option value="3">III - Verheiratet (höher)</option>
              <option value="4">IV - Verheiratet (gleich)</option>
              <option value="5">V - Verheiratet (niedriger)</option>
              <option value="6">VI - Nebenjob</option>
            </select>
          </div>
        </div>

        {steuerklasse === '3' && (
          <div className="mb-4 p-4 bg-purple-50 border-2 border-purple-300 rounded-lg">
            <label className="block text-sm font-bold text-purple-900 mb-2">
              👫 Partner-Brutto/Monat (für faire Vergleichbarkeit StKl 3/5 vs. 4/4)
            </label>
            <input 
              type="number" 
              value={partnerBrutto} 
              onChange={(e) => setPartnerBrutto(e.target.value)} 
              placeholder="z.B. 2800"
              className="w-full px-3 py-2 border-2 border-purple-300 rounded-lg focus:border-purple-500 focus:outline-none" 
            />
          </div>
        )}

        <details className="mb-4">
          <summary className="cursor-pointer text-sm font-semibold text-indigo-600 hover:text-indigo-800 mb-3">Weitere Angaben</summary>
          <div className="grid md:grid-cols-3 gap-3 mt-3">
            <div>
              <label className="block text-xs text-gray-600 mb-1">Kinder</label>
              <input type="number" value={kinder} onChange={(e) => setKinder(e.target.value)} min="0" className="w-full px-2 py-2 border border-gray-300 rounded-lg" />
            </div>
            <div>
              <label className="block text-xs text-gray-600 mb-1">Geburtsjahr</label>
              <input type="number" value={geburtsjahr} onChange={(e) => setGeburtsjahr(e.target.value)} className="w-full px-2 py-2 border border-gray-300 rounded-lg" />
            </div>
            <div>
              <label className="block text-xs text-gray-600 mb-1">Bundesland</label>
              <select value={bundesland} onChange={(e) => setBundesland(e.target.value)} className="w-full px-2 py-2 border border-gray-300 rounded-lg">
                <option value="NW">NRW</option>
                <option value="BY">Bayern</option>
                <option value="BW">Baden-Württemberg</option>
                <option value="BE">Berlin</option>
                <option value="SN">Sachsen</option>
                <option value="HE">Hessen</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-600 mb-1">Kirchensteuer</label>
              <select value={kirchensteuer} onChange={(e) => setKirchensteuer(e.target.value)} className="w-full px-2 py-2 border border-gray-300 rounded-lg">
                <option value="nein">Nein</option>
                <option value="ja">Ja</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-600 mb-1">Wochenstunden</label>
              <input type="number" value={wochenstunden} onChange={(e) => setWochenstunden(e.target.value)} className="w-full px-2 py-2 border border-gray-300 rounded-lg" />
            </div>
            <div>
              <label className="block text-xs text-gray-600 mb-1">KV-Zusatz %</label>
              <input type="number" step="0.1" value={kvZusatz} onChange={(e) => setKvZusatz(e.target.value)} className="w-full px-2 py-2 border border-gray-300 rounded-lg" />
            </div>
          </div>
        </details>

        <div className="grid md:grid-cols-3 gap-3">
          <div>
            <label className="block text-xs text-gray-600 mb-1">Fahrt hin (Min)</label>
            <input type="number" value={fahrtzeitHin} onChange={(e) => setFahrtzeitHin(e.target.value)} className="w-full px-2 py-2 border border-gray-300 rounded-lg" />
          </div>
          <div>
            <label className="block text-xs text-gray-600 mb-1">Fahrt zurück (Min)</label>
            <input type="number" value={fahrtzeitZurueck} onChange={(e) => setFahrtzeitZurueck(e.target.value)} className="w-full px-2 py-2 border border-gray-300 rounded-lg" />
          </div>
          <div>
            <label className="block text-xs text-gray-600 mb-1">Arbeitstage/Woche</label>
            <input type="number" value={arbeitstage} onChange={(e) => setArbeitstage(e.target.value)} className="w-full px-2 py-2 border border-gray-300 rounded-lg" />
          </div>
        </div>
      </div>

      {/* Netto */}
      <div className="bg-gradient-to-br from-green-500 to-emerald-600 rounded-xl shadow-lg p-6 text-white">
        <div className="text-sm font-semibold opacity-90 mb-1">Nettolohn</div>
        <div className="text-4xl font-bold mb-2">{nettoMonat.toFixed(2)} €</div>
        <div className="text-sm opacity-90">{nettoJahr.toFixed(2)} € / Jahr</div>
        
        {steuerklasse === '3' && partnerMehrsteuer > 0 && (
          <div className="mt-4 pt-4 border-t border-white/30">
            <div className="text-sm font-semibold opacity-90 mb-1">Effektives Netto (Partner-Mehrsteuer abgezogen)</div>
            <div className="text-3xl font-bold mb-1">{effektivesNettoMonat.toFixed(2)} €</div>
            <div className="text-xs opacity-90">← Nutze dies zum Vergleich mit StKl 4 Jobs!</div>
          </div>
        )}
      </div>

      {/* Stundenlöhne */}
      <div className="bg-white rounded-xl shadow-lg p-6">
        <div className="flex items-center justify-between mb-4">
          <h4 className="text-lg font-bold text-gray-800 flex items-center gap-2">
            <Clock className="w-5 h-5 text-indigo-600" />
            Stundenlöhne
          </h4>
          {steuerklasse === '3' && partnerMehrsteuer > 0 && (
            <button
              onClick={() => setStundenlohnMitPartnerAnpassung(!stundenlohnMitPartnerAnpassung)}
              className="flex items-center gap-2 px-3 py-1 bg-purple-100 hover:bg-purple-200 border-2 border-purple-300 rounded-lg text-xs font-semibold text-purple-900 transition-colors"
            >
              {stundenlohnMitPartnerAnpassung ? (
                <>
                  <ToggleRight className="w-4 h-4" />
                  Für Vergleich
                </>
              ) : (
                <>
                  <ToggleLeft className="w-4 h-4" />
                  Normal
                </>
              )}
            </button>
          )}
        </div>
        
        <div className="space-y-3">
          {/* Brutto */}
          <div className="p-4 bg-gray-50 border-2 border-gray-300 rounded-lg">
            <div className="flex justify-between items-center">
              <div>
                <div className="text-sm font-semibold text-gray-700">Brutto / Stunde</div>
                <div className="text-xs text-gray-500">Vor allen Abzügen</div>
              </div>
              <div className="text-3xl font-bold text-gray-700">{bruttoStunde.toFixed(2)} €</div>
            </div>
          </div>
          
          {/* Netto */}
          <div className="p-4 bg-blue-50 border-2 border-blue-300 rounded-lg">
            <div className="flex justify-between items-center">
              <div>
                <div className="text-sm font-semibold text-gray-700">Netto / Stunde</div>
                <div className="text-xs text-gray-500">
                  {stundenlohnMitPartnerAnpassung && steuerklasse === '3' && partnerMehrsteuer > 0 
                    ? 'Mit Partner-Anpassung für fairen Vergleich' 
                    : 'Reine Arbeitszeit'}
                </div>
              </div>
              <div className="text-3xl font-bold text-blue-700">{nettoStunde.toFixed(2)} €</div>
            </div>
          </div>
          
          {/* Bereinigt */}
          <div className="p-4 bg-purple-50 border-2 border-purple-400 rounded-lg">
            <div className="flex justify-between items-center">
              <div>
                <div className="text-sm font-semibold text-gray-700">Bereinigter Stundenlohn</div>
                <div className="text-xs text-gray-500">Inkl. {(fahrtzeitMonat).toFixed(1)}h Fahrtzeit/Monat</div>
              </div>
              <div className="text-3xl font-bold text-purple-700">{bereinigterStunde.toFixed(2)} €</div>
            </div>
          </div>
          
          <div className="text-xs text-center text-gray-600 bg-gray-50 py-2 rounded">
            Zeitverlust durch Fahrtzeit: <span className="font-bold text-red-600">{((nettoStunde - bereinigterStunde) / nettoStunde * 100).toFixed(1)}%</span>
          </div>
          
          {steuerklasse === '3' && partnerMehrsteuer > 0 && (
            <div className="p-3 bg-purple-50 border border-purple-300 rounded-lg text-xs text-purple-900">
              <strong>💡 Toggle-Tipp:</strong> {stundenlohnMitPartnerAnpassung 
                ? 'Zeigt "effektives Netto" für fairen Vergleich mit StKl 4 Jobs. Schalte auf "Normal" um dein tatsächliches Netto zu sehen.'
                : 'Zeigt dein tatsächliches Netto (was auf dein Konto kommt). Schalte auf "Für Vergleich" um fair mit StKl 4 Jobs zu vergleichen.'}
            </div>
          )}
        </div>
      </div>

      {/* Überstunden */}
      <div className="bg-gradient-to-br from-amber-50 to-orange-50 border-2 border-amber-400 rounded-xl shadow-lg p-6">
        <h4 className="text-lg font-bold text-amber-900 mb-4 flex items-center gap-2">
          <Zap className="w-5 h-5 text-amber-600" />
          Überstunden-Rechner
        </h4>
        
        <div className="grid md:grid-cols-2 gap-4 mb-4">
          <div>
            <label className="block text-sm font-semibold text-amber-900 mb-2">Überstunden-Bonus (%)</label>
            <input type="number" value={ueberstundenBonus} onChange={(e) => setUeberstundenBonus(e.target.value)} className="w-full px-3 py-2 border-2 border-amber-300 rounded-lg focus:border-amber-500 focus:outline-none" />
            <div className="text-xs text-amber-700 mt-1">Brutto: {bruttoUeberstunde.toFixed(2)} €/h</div>
          </div>
          <div>
            <label className="block text-sm font-semibold text-amber-900 mb-2">Anzahl Überstunden</label>
            <input type="number" value={ueberstundenAnzahl} onChange={(e) => setUeberstundenAnzahl(e.target.value)} className="w-full px-3 py-2 border-2 border-amber-300 rounded-lg focus:border-amber-500 focus:outline-none" />
          </div>
        </div>

        <div className="space-y-3">
          <div className="p-4 bg-white border-2 border-amber-500 rounded-lg">
            <div className="flex justify-between items-center mb-2">
              <span className="text-sm font-semibold text-gray-700">NETTO pro Überstunde:</span>
              <span className="text-2xl font-bold text-green-700">{nettoProUeberstunde.toFixed(2)} €</span>
            </div>
            <div className="flex justify-between items-center text-xs">
              <span className="text-gray-600">Effektiver Bonus nach Steuern:</span>
              <span className="font-bold text-amber-700">+{effektiverBonus.toFixed(1)}%</span>
            </div>
          </div>

          {stundenAnzahl > 0 && (
            <div className="p-4 bg-green-50 border-2 border-green-400 rounded-lg">
              <div className="text-sm font-semibold text-green-900 mb-1">{stundenAnzahl} Überstunden bringen dir:</div>
              <div className="text-3xl font-bold text-green-700 mb-1">{nettoUeberstunden.toFixed(2)} € NETTO</div>
              <div className="text-xs text-green-700 mb-2">Von {bruttoUeberstundenGesamt.toFixed(2)} € Brutto</div>
              <div className="text-xs text-green-800 bg-green-100 p-2 rounded mt-2">
                ✓ Abzüge pro Stunde: {svAufUeberstunden.toFixed(2)}€ SV + {steuernAufUeberstunden.toFixed(2)}€ Steuern<br/>
                💡 Grenzsteuersatz: {(grenzsteuersatz * 100).toFixed(1)}% (auf dein hohes zvE von {(zvE/1000).toFixed(1)}k€)
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Partner Mehrsteuer */}
      {steuerklasse === '3' && partnerBrutto && parseFloat(partnerBrutto) > 0 && (
        <div className="bg-gradient-to-br from-red-50 to-orange-50 border-2 border-red-300 rounded-xl shadow-lg p-5">
          <div className="flex items-start gap-2 mb-3">
            <AlertTriangle className="w-6 h-6 text-red-600 flex-shrink-0 mt-0.5" />
            <div className="text-base font-bold text-red-900">⚠️ Steuerklasse 3/5 vs. 4/4 Vergleich</div>
          </div>
          
          <div className="space-y-3">
            <div className="p-3 bg-white rounded-lg">
              <div className="text-sm text-gray-700 mb-1">✅ Du sparst (StKl 3 statt 4):</div>
              <div className="text-xl font-bold text-green-700">+{ichSpare.toFixed(2)} € / Jahr</div>
              <div className="text-xs text-gray-600">+{(ichSpare/12).toFixed(2)} € / Monat</div>
            </div>
            
            <div className="p-3 bg-white rounded-lg">
              <div className="text-sm text-gray-700 mb-1">❌ Partner zahlt MEHR (StKl 5 statt 4):</div>
              <div className="text-xl font-bold text-red-700">-{partnerMehrsteuer.toFixed(2)} € / Jahr</div>
              <div className="text-xs text-gray-600">-{(partnerMehrsteuer/12).toFixed(2)} € / Monat</div>
            </div>
            
            <div className="p-4 bg-gray-900 rounded-lg border-2 border-gray-700">
              <div className="text-sm text-gray-300 mb-1">💰 GESAMT-Effekt (beide zusammen):</div>
              <div className={`text-2xl font-bold ${gesamtVorteilNachteil >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                {gesamtVorteilNachteil >= 0 ? '+' : ''}{gesamtVorteilNachteil.toFixed(2)} € / Jahr
              </div>
              <div className="text-xs text-gray-400">
                {gesamtVorteilNachteil >= 0 ? '+' : ''}{(gesamtVorteilNachteil/12).toFixed(2)} € / Monat
              </div>
            </div>
            
            <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
              <div className="text-xs text-blue-900">
                <div className="font-semibold mb-1">💡 So funktioniert's:</div>
                <div>• "Effektives Netto" oben = Dein Netto minus Partner-Mehrsteuer</div>
                <div>• Nutze es zum Vergleich mit StKl 4 Jobs</div>
              </div>
            </div>
            
            {gesamtVorteilNachteil < 0 && (
              <div className="p-3 bg-yellow-50 border border-yellow-300 rounded-lg">
                <div className="text-xs text-yellow-900">
                  ⚠️ <strong>Achtung:</strong> Bei euren Gehältern lohnt sich StKl 3/5 nicht! 
                  Ihr zahlt zusammen MEHR Steuern. Besser beide StKl 4!
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Abzüge */}
      <details className="bg-white rounded-xl shadow-lg p-4">
        <summary className="cursor-pointer text-sm font-bold text-gray-800">Abzüge anzeigen</summary>
        <div className="mt-3 space-y-1 text-sm">
          <div className="flex justify-between py-2 border-b"><span>Krankenversicherung</span><span className="font-semibold">{kv.toFixed(2)} €</span></div>
          <div className="flex justify-between py-2 border-b"><span>Pflegeversicherung</span><span className="font-semibold">{pv.toFixed(2)} €</span></div>
          <div className="flex justify-between py-2 border-b"><span>Rentenversicherung</span><span className="font-semibold">{rv.toFixed(2)} €</span></div>
          <div className="flex justify-between py-2 border-b"><span>Arbeitslosenversicherung</span><span className="font-semibold">{av.toFixed(2)} €</span></div>
          <div className="flex justify-between py-2 border-b border-gray-300 font-semibold"><span>Sozialversicherung</span><span>{gesamtSV.toFixed(2)} €</span></div>
          <div className="flex justify-between py-2 border-b"><span>Lohnsteuer</span><span className="font-semibold">{monatLSt.toFixed(2)} €</span></div>
          <div className="flex justify-between py-2 border-b"><span>Solidaritätszuschlag</span><span className="font-semibold">{monatSoli.toFixed(2)} €</span></div>
          {kirchensteuer === 'ja' && <div className="flex justify-between py-2 border-b"><span>Kirchensteuer</span><span className="font-semibold">{monatKSt.toFixed(2)} €</span></div>}
          <div className="flex justify-between py-3 pt-3 border-t-2 border-gray-400 font-bold"><span>GESAMT ABZÜGE</span><span className="text-red-600">{(gesamtSV + monatLSt + monatSoli + monatKSt).toFixed(2)} €</span></div>
        </div>
      </details>
    </div>
  );
}

export default function LohnrechnerPro2026() {
  const [vergleichsModus, setVergleichsModus] = useState(false);
  const [profiles, setProfiles] = useState([]);
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [deleteProfileId, setDeleteProfileId] = useState(null);
  const [saveData, setSaveData] = useState(null);
  const [profileName, setProfileName] = useState('');
  const [profileNotes, setProfileNotes] = useState('');
  const [profileColor, setProfileColor] = useState('blue');
  const [profileToLoadA, setProfileToLoadA] = useState(null);
  const [profileToLoadB, setProfileToLoadB] = useState(null);

  React.useEffect(() => {
    const stored = JSON.parse(localStorage.getItem('jobProfiles') || '[]');
    setProfiles(stored);
    
    // Event Listener für Save-Button
    const handleSaveProfile = (e) => {
      setSaveData(e.detail);
      setShowSaveDialog(true);
    };
    
    window.addEventListener('saveProfile', handleSaveProfile);
    return () => window.removeEventListener('saveProfile', handleSaveProfile);
  }, []);

  const saveProfile = () => {
    if (!saveData) return;
    
    const profile = {
      id: Date.now(),
      name: profileName || saveData.label,
      notes: profileNotes,
      color: profileColor,
      data: saveData.data,
      savedAt: new Date().toISOString()
    };
    
    const updated = [...profiles, profile];
    setProfiles(updated);
    localStorage.setItem('jobProfiles', JSON.stringify(updated));
    
    setShowSaveDialog(false);
    setProfileName('');
    setProfileNotes('');
    setSaveData(null);
    alert('✓ Profil gespeichert!');
  };

  const deleteProfile = (id, e) => {
    if (e) e.stopPropagation();
    setDeleteProfileId(id);
    setShowDeleteDialog(true);
  };
  
  const confirmDelete = () => {
    if (deleteProfileId) {
      const updated = profiles.filter(p => p.id !== deleteProfileId);
      setProfiles(updated);
      localStorage.setItem('jobProfiles', JSON.stringify(updated));
      setShowDeleteDialog(false);
      setDeleteProfileId(null);
    }
  };

  const exportProfiles = () => {
    const dataStr = JSON.stringify(profiles, null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `lohnrechner-profile-${new Date().toISOString().split('T')[0]}.json`;
    link.click();
  };

  const importProfiles = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const imported = JSON.parse(event.target.result);
        const updated = [...profiles, ...imported];
        setProfiles(updated);
        localStorage.setItem('jobProfiles', JSON.stringify(updated));
        alert('✓ Profile importiert!');
      } catch (err) {
        alert('❌ Fehler beim Importieren!');
      }
    };
    reader.readAsText(file);
  };

  const colorClasses = {
    blue: 'bg-blue-100 border-blue-300 text-blue-900',
    green: 'bg-green-100 border-green-300 text-green-900',
    purple: 'bg-purple-100 border-purple-300 text-purple-900',
    red: 'bg-red-100 border-red-300 text-red-900',
    yellow: 'bg-yellow-100 border-yellow-300 text-yellow-900'
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 p-4 md:p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="bg-white rounded-2xl shadow-xl p-6 mb-6">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-3">
              <Calculator className="w-8 h-8 text-indigo-600" />
              <h1 className="text-3xl font-bold text-gray-800">Lohnrechner Pro 2026</h1>
            </div>
            <button
              onClick={() => setVergleichsModus(!vergleichsModus)}
              className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-lg transition-colors"
            >
              {vergleichsModus ? <ToggleRight className="w-5 h-5" /> : <ToggleLeft className="w-5 h-5" />}
              {vergleichsModus ? 'Vergleich AUS' : 'Vergleich EIN'}
            </button>
          </div>
          <p className="text-gray-600 text-sm mb-2">
            Korrekte Lohnsteuer 2026 • Überstunden NETTO • Steuerklasse 3/5 • Profile speichern
          </p>
          <div className="flex items-start gap-2 p-3 bg-blue-50 border border-blue-200 rounded-lg text-xs text-blue-900">
            <Info className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <div>
              <strong>Hinweis:</strong> Vereinfachte Berechnung nach gesetzlichen Vorgaben 2026. 
              Für rechtsverbindliche Werte nutze bitte brutto-netto-rechner.info oder den offiziellen BMF-Rechner.
            </div>
          </div>
        </div>

        {/* Profile Verwaltung */}
        {profiles.length > 0 && (
          <div className="bg-white rounded-xl shadow-lg p-6 mb-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                <Save className="w-5 h-5 text-indigo-600" />
                Gespeicherte Profile ({profiles.length})
              </h3>
              <div className="flex gap-2">
                <button onClick={exportProfiles} className="flex items-center gap-1 px-3 py-1 bg-green-600 hover:bg-green-700 text-white text-sm rounded-lg">
                  <Download className="w-4 h-4" />
                  Export
                </button>
                <label className="flex items-center gap-1 px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded-lg cursor-pointer">
                  <Upload className="w-4 h-4" />
                  Import
                  <input type="file" accept=".json" onChange={importProfiles} className="hidden" />
                </label>
              </div>
            </div>
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-3">
              {profiles.map((profile) => (
                <div key={profile.id} className={`p-4 border-2 rounded-lg ${colorClasses[profile.color]}`}>
                  <div className="flex justify-between items-start mb-2">
                    <div className="font-bold text-sm">{profile.name}</div>
                    <button 
                      onClick={(e) => deleteProfile(profile.id, e)} 
                      className="text-red-600 hover:text-white hover:bg-red-600 p-2 rounded-lg transition-all relative z-10"
                      title="Profil löschen"
                      type="button"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                  {profile.notes && <div className="text-xs mb-2">{profile.notes}</div>}
                  <div className="text-xs opacity-75 mb-2">
                    {new Date(profile.savedAt).toLocaleDateString('de-DE')}
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setProfileToLoadA(profile.data)}
                      className="flex-1 px-2 py-1 bg-white border border-gray-300 rounded text-xs font-semibold hover:bg-gray-50"
                    >
                      → Job A
                    </button>
                    {vergleichsModus && (
                      <button
                        onClick={() => setProfileToLoadB(profile.data)}
                        className="flex-1 px-2 py-1 bg-white border border-gray-300 rounded text-xs font-semibold hover:bg-gray-50"
                      >
                        → Job B
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Job Berechnungen */}
        <div className={`grid ${vergleichsModus ? 'md:grid-cols-2' : 'grid-cols-1'} gap-6`}>
          <JobBerechnung label={vergleichsModus ? "Job A" : "Berechnung"} isComparison={vergleichsModus} profileToLoad={profileToLoadA} />
          {vergleichsModus && <JobBerechnung label="Job B" isComparison={vergleichsModus} profileToLoad={profileToLoadB} />}
        </div>

        {/* Delete Dialog */}
        {showDeleteDialog && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-xl shadow-2xl p-6 max-w-md w-full">
              <h3 className="text-xl font-bold mb-4 text-red-900">Profil löschen?</h3>
              <p className="text-gray-700 mb-6">
                Möchtest du dieses Profil wirklich löschen? Diese Aktion kann nicht rückgängig gemacht werden.
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => {
                    setShowDeleteDialog(false);
                    setDeleteProfileId(null);
                  }}
                  className="flex-1 px-4 py-2 bg-gray-300 hover:bg-gray-400 rounded-lg font-semibold"
                >
                  Abbrechen
                </button>
                <button
                  onClick={confirmDelete}
                  className="flex-1 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg font-semibold"
                >
                  Löschen
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Save Dialog */}
        {showSaveDialog && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-xl shadow-2xl p-6 max-w-md w-full">
              <h3 className="text-xl font-bold mb-4">Profil speichern</h3>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-semibold mb-2">Profil-Name</label>
                  <input
                    type="text"
                    value={profileName}
                    onChange={(e) => setProfileName(e.target.value)}
                    placeholder={saveData ? saveData.label : "z.B. Job bei Firma XYZ"}
                    className="w-full px-3 py-2 border-2 border-gray-300 rounded-lg focus:border-indigo-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold mb-2">Notizen (optional)</label>
                  <textarea
                    value={profileNotes}
                    onChange={(e) => setProfileNotes(e.target.value)}
                    placeholder="z.B. Gutes Team, flexible Zeiten..."
                    className="w-full px-3 py-2 border-2 border-gray-300 rounded-lg focus:border-indigo-500 focus:outline-none"
                    rows="3"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold mb-2">Farbe</label>
                  <div className="flex gap-2">
                    {['blue', 'green', 'purple', 'red', 'yellow'].map(color => (
                      <button
                        key={color}
                        onClick={() => setProfileColor(color)}
                        className={`w-10 h-10 rounded-lg border-2 ${profileColor === color ? 'border-gray-900' : 'border-gray-300'} ${colorClasses[color]}`}
                      />
                    ))}
                  </div>
                </div>
                <div className="flex gap-2 pt-2">
                  <button
                    onClick={() => {
                      setShowSaveDialog(false);
                      setProfileName('');
                      setProfileNotes('');
                      setSaveData(null);
                    }}
                    className="flex-1 px-4 py-2 bg-gray-300 hover:bg-gray-400 rounded-lg font-semibold"
                  >
                    Abbrechen
                  </button>
                  <button
                    onClick={saveProfile}
                    disabled={!profileName && !saveData}
                    className="flex-1 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-semibold disabled:opacity-50"
                  >
                    Speichern
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Info */}
        <div className="mt-6 bg-gradient-to-r from-purple-100 to-pink-100 border-2 border-purple-300 rounded-xl p-6">
          <h3 className="text-lg font-bold text-purple-900 mb-3">💡 Features</h3>
          <div className="grid md:grid-cols-2 gap-4 text-sm text-purple-800">
            <div>
              <p className="font-semibold mb-1">✅ Korrekte Lohnsteuer 2026</p>
              <p className="text-xs">Mit Vorsorgepauschale & Splitting-Verfahren</p>
            </div>
            <div>
              <p className="font-semibold mb-1">⚡ Überstunden NETTO</p>
              <p className="text-xs">Zeigt was NACH Steuern & SV wirklich bleibt!</p>
            </div>
            <div>
              <p className="font-semibold mb-1">⚠️ Steuerklasse 3/5</p>
              <p className="text-xs">"Effektives Netto" für fairen Vergleich mit StKl 4</p>
            </div>
            <div>
              <p className="font-semibold mb-1">🎯 Bereinigter Stundenlohn</p>
              <p className="text-xs">Inkl. Fahrtzeit = ECHTER Wert deiner Zeit!</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
