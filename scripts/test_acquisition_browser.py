"""Real React component, simulated API. No SSO/database/scanner validation."""
from pathlib import Path
import argparse,json,shutil
from playwright.sync_api import sync_playwright,expect
p=argparse.ArgumentParser();p.add_argument('--bench',type=Path,required=True);p.add_argument('--proofs',type=Path,required=True);a=p.parse_args();a.proofs.mkdir(parents=True,exist_ok=True)
checks=[];errors=[]
try:
 with sync_playwright() as pw:
  browser=pw.chromium.launch(executable_path=shutil.which('chromium') or None,headless=True,args=['--no-sandbox']);page=browser.new_page(viewport={'width':1440,'height':1100});page.set_default_timeout(7000);page.on('pageerror',lambda e:errors.append(str(e)))
  page.set_content('<!doctype html><html lang="fr"><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><body><div class="test-banner">BANC DE RECETTE LOCAL — API, identité et données simulées. Aucun serveur métier.</div><div id="root"></div></body></html>');page.add_style_tag(content=(a.bench/'style.css').read_text());page.evaluate("if (!crypto.randomUUID) crypto.randomUUID=()=>{const b=crypto.getRandomValues(new Uint8Array(16));b[6]=(b[6]&15)|64;b[8]=(b[8]&63)|128;return [...b].map((v,i)=>([4,6,8,10].includes(i)?'-':'')+v.toString(16).padStart(2,'0')).join('')}");page.add_script_tag(content=(a.bench/'app.js').read_text());expect(page.get_by_role('heading',name='Acquisition & imports')).to_be_visible();checks.append('module mounted')
  page.locator('input[type=file]').first.set_input_files({'name':'test.csv','mimeType':'text/csv','buffer':b'reference;titre;type_document_code\nDOC-TEST;Rapport;RAPPORT'})
  page.get_by_role('button',name='Analyser le fichier',exact=True).click();expect(page.get_by_role('heading',name='À confirmer · 1 lignes')).to_be_visible();checks.append('preview received')
  commit=page.get_by_role('button',name='Créer les 1 éléments',exact=True);expect(commit).to_be_disabled();checks.append('explicit confirmation required')
  page.get_by_label('J’ai vérifié le type, le périmètre et les valeurs.').check();commit.click();expect(page.get_by_role('heading',name='Import réalisé · 1 lignes')).to_be_visible();checks.append('commit rendered')
  calls=page.evaluate('window.__acqCalls');upload=next(c for c in calls if c['p']=='/acquisition/imports/preview');assert upload['fields']['departmentId'].endswith('000010');checks.append('department retained')
  assert next(c for c in calls if c['p'].endswith('/commit'))['o']['body']['expectedSha256']=='b'*64;checks.append('commit confirms preview hash')
  page.get_by_role('button',name='3 · Extraire et relire',exact=True).click()
  page.get_by_role('button',name='Document lié',exact=True).click();page.get_by_role('button',name='DOC-TEST · Rapport de recette',exact=True).click()
  page.get_by_label('Version documentaire',exact=True).select_option('10000000-0000-4000-8000-000000000004')
  page.get_by_label('Fichier validé',exact=True).select_option('10000000-0000-4000-8000-000000000005')
  page.get_by_role('button',name='Demander l’extraction',exact=True).click();expect(page.get_by_role('heading',name='À relire',exact=True)).to_be_visible();checks.append('extraction result visible')
  expect(page.get_by_label('Appliquer ce titre à la notice ouverte',exact=True)).not_to_be_checked();expect(page.get_by_label('Appliquer cette date à la notice ouverte',exact=True)).not_to_be_checked();checks.append('no automatic field application')
  page.get_by_role('button',name='Proposer comme titre',exact=True).click();page.get_by_role('button',name='Proposer comme date',exact=True).click()
  page.get_by_label('Texte extrait complet — corrections à relire',exact=True).fill('Texte corrigé et relu par l’agent de recette.')
  page.get_by_label('J’ai relu le texte et autorise son enregistrement comme résultat OCR validé',exact=True).check()
  page.get_by_label('Motif de la décision (10 caractères minimum)',exact=True).fill('Vérification de recette sur données fictives')
  page.screenshot(path=str(a.proofs/'acquisition-extraction.png'),full_page=True)
  page.get_by_role('button',name='Valider les choix cochés',exact=True).click();expect(page.get_by_role('heading',name='Examen enregistré',exact=True)).to_be_visible();checks.append('human review recorded')
  review=next(c for c in page.evaluate('window.__acqCalls') if c['p'].endswith('/review'))['o'];assert review['body']['applyTitle'] and review['body']['applyDate'];assert review['body']['correctedText'].startswith('Texte corrigé');assert review['idempotencyKey'];checks.append('review payload and key')
  page.get_by_role('button',name='1 · Importer un tableau',exact=True).click();page.evaluate('window.__failNext=true');page.locator('input[type=file]').first.set_input_files({'name':'test.csv','mimeType':'text/csv','buffer':b'reference;titre\nX;Y'});page.get_by_role('button',name='Analyser le fichier',exact=True).click();expect(page.get_by_role('alert')).to_contain_text('ERREUR API SIMULEE');expect(page.get_by_role('button',name='Analyser le fichier',exact=True)).to_be_enabled();checks.append('API failure visible and loading ends')
  page.screenshot(path=str(a.proofs/'acquisition-import.png'),full_page=True)
  page.set_viewport_size({'width':390,'height':844});assert page.evaluate('document.documentElement.scrollWidth<=window.innerWidth+2');checks.append('mobile bounded layout')
  page.get_by_role('button',name='2 · Scanner un document',exact=True).click();expect(page.get_by_label('Code de jumelage temporaire',exact=True)).to_have_attribute('type','password');checks.append('scanner pairing UI')
  assert not errors,errors;checks.append('no JavaScript errors')
  browser.close()
except Exception:
 try:
  (a.proofs/'browser-failure.txt').write_text(page.locator('body').inner_text()+ '\n\n'+json.dumps(page.evaluate('window.__acqCalls'),ensure_ascii=False,default=str));page.screenshot(path=str(a.proofs/'browser-failure.png'),full_page=True)
 except Exception:pass
 raise
finally:
 (a.proofs/'browser-tests.json').write_text(json.dumps({'mode':'REAL_REACT_SIMULATED_API_OFFLINE_DOM','harness':'HTML/assets injected into blank page; crypto.randomUUID polyfill for opaque test origin only; no browser-server networking exercised','passed':checks,'javascriptErrors':errors},indent=2,ensure_ascii=False))
print(json.dumps({'passed':len(checks),'checks':checks},ensure_ascii=False))
