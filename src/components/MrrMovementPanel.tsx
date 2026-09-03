import { formatMonthFull, formatRub, formatSignedRub } from '../lib/format'
import { isCurrentMonth } from '../lib/metrics'
import type { MovementContract, MovementMonth } from '../lib/movement'

function ContractRow({ contract, sign }: { contract: MovementContract; sign: 'pos' | 'neg' }) {
  return (
    <li className="movement-list__item">
      <div className="movement-list__main">
        <span className="contract-num">{contract.contract_num}</span>
        {contract.client_name}
      </div>
      <span className={`movement-list__amount movement-list__amount--${sign}`}>
        {contract.tariff === null ? '—' : sign === 'pos' ? `+${formatRub(contract.tariff)}` : `−${formatRub(contract.tariff)}`}
      </span>
    </li>
  )
}

export function MrrMovementPanel({ movement }: { movement: MovementMonth | null }) {
  if (!movement) {
    return (
      <div className="card">
        <div className="card__title">Почему MRR изменился</div>
        <p className="state-msg">Нет данных о движении для выбранного месяца</p>
      </div>
    )
  }

  const isCurrent = isCurrentMonth(movement.period_start)
  const direction = movement.net_mrr >= 0 ? 'вырос' : 'упал'

  return (
    <div className="card">
      <div className="movement-panel__header">
        <div className="movement-panel__title">
          {formatMonthFull(movement.period_start)} · MRR {direction} на {formatRub(Math.abs(movement.net_mrr))}
        </div>
        {isCurrent && <span className="movement-panel__badge">в процессе</span>}
      </div>

      {isCurrent ? (
        <p className="state-msg">Месяц ещё не закрыт — разбивка по контрактам появится после его завершения.</p>
      ) : (
        <>
          <div className="movement-panel__columns">
            <div className="movement-col movement-col--new">
              <div className="movement-col__title">Пришли / возобновили (+)</div>
              {movement.new_contracts.length === 0 ? (
                <p className="state-msg">Нет</p>
              ) : (
                <ul className="movement-list">
                  {movement.new_contracts.map((contract) => (
                    <ContractRow key={contract.contract_num} contract={contract} sign="pos" />
                  ))}
                </ul>
              )}
            </div>
            <div className="movement-col movement-col--churn">
              <div className="movement-col__title">Отток (−)</div>
              {movement.churn_contracts.length === 0 ? (
                <p className="state-msg">Нет</p>
              ) : (
                <ul className="movement-list">
                  {movement.churn_contracts.map((contract) => (
                    <ContractRow key={contract.contract_num} contract={contract} sign="neg" />
                  ))}
                </ul>
              )}
            </div>
          </div>
          <div className="movement-panel__summary">
            New {formatSignedRub(movement.new_mrr)} · Churn {formatRub(movement.churn_mrr)} · чистое{' '}
            {formatSignedRub(movement.net_mrr)}
          </div>
        </>
      )}
    </div>
  )
}
