import React, { useState } from 'react';
import { useSession } from '../auth/session';
import { Busy, Empty, ErrorNotice, Notice, formatDate, useResource } from './components';
import { saveBlob, useAction } from './ReadingRoomParts';
import { statisticsFileName, statisticsSections, statisticsYears, type AnnualStatistics } from '../core/readingRoom';

/** Les statistiques annuelles de l'institution, comptées depuis les registres (jamais saisies) et exportables en tableur. */
export function ReadingRoomStatistics({ institutionId }: { institutionId: string }) {
    const { readingRoom, epoch } = useSession();
    const years = statisticsYears();
    const [year, setYear] = useState(years[0]!);
    const action = useAction();
    const q = useResource<AnnualStatistics>(s => readingRoom!.statistics(institutionId, year, s), `rr-statistics:${institutionId}:${year}:${epoch}`);
    const sections = statisticsSections(q.data);
    const download = async () => {
        const blob = await action.run({ csv: year }, () => readingRoom!.statisticsCsv(institutionId, year));
        if (blob) saveBlob(blob, statisticsFileName(year));
    };
    return <div className="panel" aria-label="Statistiques annuelles" role="region">
        <div className="section-heading"><h3>Statistiques annuelles</h3>
            <button type="button" className="btn small secondary" disabled={action.busy || !q.data} onClick={download}>Exporter en tableur (CSV)</button></div>
        <div className="table-toolbar"><label>Année <select aria-label="Année" value={year} onChange={e => setYear(Number(e.target.value))}>{years.map(y => <option key={y} value={y}>{y}</option>)}</select></label></div>
        <div className="panel-padding"><Notice>Ces chiffres sont comptés depuis les registres de l’institution pour l’année civile choisie. Le volume du fonds numérique est un instantané à la date
            d’établissement ; seules les entrées structurées sont rattachées à une institution d’archives.</Notice></div>
        {action.error ? <ErrorNotice error={action.error} /> : null}
        {q.loading && !q.data ? <Busy /> : q.error ? <ErrorNotice error={q.error} onRetry={q.refresh} />
            : sections.length === 0 ? <Empty title="Aucune statistique" icon="chart" />
                : <>
                    {sections.map(section => <section key={section.section} aria-label={section.title} className="panel-padding">
                        <h4>{section.title}</h4>
                        <dl className="preservation-summary">{section.lines.map(line => <div key={line.indicator}><dt>{line.label}</dt><dd>{line.text}</dd></div>)}</dl>
                    </section>)}
                    {q.data && <p className="panel-padding"><small>Établi le {formatDate(q.data.generatedAt)}.</small></p>}
                </>}
    </div>;
}
