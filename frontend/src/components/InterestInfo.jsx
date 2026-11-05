import { useQuery } from '@tanstack/react-query'
import { ApiError } from '../services/api'
import { interestCountsQuery } from '../services/interests'
import { profileQuery } from '../services/profile'
import { capitalize } from '../utils/interestGroups'
import LoadError from './LoadError'
import Modal from './Modal'

// Rutan som öppnas när man trycker på ett intresse i Intressebiblioteket som man inte har valt (SCRUM-306): var i
// biblioteket det ligger (t.ex. Gaming › Action › Fortnite), hur många som har det eller något under det i landet och i
// ens kommun (från profilen; saknas den visas bara landet), och "Lägg till på min profil". Krysset, Esc eller ett klick
// bredvid stänger. Blockerade och avstängda räknas inte, och inte man själv (det sköter backend).
//
// `interest` är { id, name, path } från biblioteket eller sökningen, och `onAdd()` lägger till det.
function InterestInfo({ interest, onAdd, onClose }) {
  const profileResult = useQuery(profileQuery)
  const { data, isPending, isError, error, refetch, isFetching } = useQuery({
    ...interestCountsQuery(interest.id, profileResult.data?.municipality_code ?? null),
    // Vänta på profilen, så att antalet inte hämtas en gång utan kommun och en gång till med.
    enabled: !profileResult.isPending,
  })
  const missing = isError && error instanceof ApiError && error.status === 404

  return (
    <Modal title={capitalize(interest.name)} onClose={onClose} closeIcon>
      <p className="hint-text interest-info-path">
        {[...(interest.path ?? []), capitalize(interest.name)].join(' › ')}
      </p>
      {missing ? (
        <p className="form-error">Det intresset finns inte, eller så syns det inte för dig än.</p>
      ) : isError ? (
        <LoadError
          text="Kunde inte hämta antalet."
          onRetry={() => refetch()}
          retrying={isFetching}
          className="form-error"
        />
      ) : isPending ? (
        <p className="hint-text">Hämtar antalet...</p>
      ) : (
        <div className="interest-info-counts">
          <p className="interest-info-count">
            <span className="interest-info-number">{data.interest.country}</span> i Sverige
          </p>
          {data.municipality && (
            <p className="interest-info-count">
              <span className="interest-info-number">{data.interest.municipality}</span> i {data.municipality.name}, där
              du bor
            </p>
          )}
        </div>
      )}
      {!missing && (
        <button type="button" className="primary-button" onClick={onAdd}>
          + Lägg till på min profil
        </button>
      )}
    </Modal>
  )
}

export default InterestInfo
