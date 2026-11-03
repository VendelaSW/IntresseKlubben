import { useQuery } from '@tanstack/react-query'
import { Link, useNavigate, useParams } from 'react-router-dom'
import BackButton from '../components/BackButton'
import LoadError from '../components/LoadError'
import { useCanGoBack } from '../hooks/useCanGoBack'
import { ApiError } from '../services/api'
import { interestPageQuery } from '../services/interests'
import { profileQuery } from '../services/profile'
import { capitalize, interestPageHref } from '../utils/interestGroups'

const people = (n) => `${n} ${n === 1 ? 'person' : 'personer'}`

// Ett intresses sida (SCRUM-306), /intressen/:interestId, ett block på kartan som de andra sidorna (se
// MapPagePad). Samma sida för alla intressen. Visar var intresset hör hemma (path), hur många som har det
// eller något under det i hela landet och i ens egen kommun (från profilen; saknas den visas bara landet),
// och överintressena och underintressena med antal, som länkar till sina sidor. Blockerade och avstängda
// räknas inte (det sköter backend). En länk öppnar Medlemmar › Sök med intresset (och kommunen) i filtret,
// i stället för en egen lista med personer här.
function InterestPage() {
  // Id:t från adressen är text, men id:n från API:t är tal.
  const interestId = Number(useParams().interestId)
  const navigate = useNavigate()
  const canGoBack = useCanGoBack()
  const profileResult = useQuery(profileQuery)
  const municipalityCode = profileResult.data?.municipality_code ?? null
  const validId = Number.isInteger(interestId) && interestId > 0
  const { data, isPending, isError, error, refetch, isFetching } = useQuery({
    ...interestPageQuery(interestId, municipalityCode),
    // Vänta på profilen, så att sidan inte hämtas en gång utan kommun och en gång till med.
    enabled: validId && !profileResult.isPending,
  })
  const missing = !validId || (isError && error instanceof ApiError && error.status === 404)

  // Tillbaka dit man kom ifrån, eller till profilen om sidan öppnades direkt (t.ex. en delad länk, se useCanGoBack).
  function handleBack() {
    if (canGoBack()) navigate(-1)
    else navigate('/profil')
  }

  return (
    <div className="content-stack">
      <BackButton onClick={handleBack} />
      {missing ? (
        <p className="form-error">Det intresset finns inte, eller så syns det inte för dig än.</p>
      ) : isError ? (
        <LoadError
          text="Kunde inte hämta intresset."
          onRetry={() => refetch()}
          retrying={isFetching}
          className="form-error"
        />
      ) : isPending ? (
        <p>Laddar intresset...</p>
      ) : (
        <InterestCard data={data} />
      )}
    </div>
  )
}

function InterestCard({ data }) {
  const { interest, municipality, ancestors, children } = data
  const name = capitalize(interest.name)
  // Medlemmar › Sök, med intresset och ens kommun valda i filtret (se PeoplePage).
  const peopleSearch = `/personer?${new URLSearchParams({
    flik: 'sok',
    intresse: interest.id,
    ...(municipality && { kommun: municipality.code }),
  })}`

  return (
    <section className="card card-wide content-stack interest-page">
      <div>
        {interest.path.length > 0 && <p className="hint-text interest-page-path">{interest.path.join(' › ')}</p>}
        <h1 className="card-title">{name}</h1>
      </div>

      <div className="interest-page-counts">
        <p className="interest-page-count">
          <span className="interest-page-number">{interest.country}</span> i hela Sverige
        </p>
        {municipality && (
          <p className="interest-page-count">
            <span className="interest-page-number">{interest.municipality}</span> i {municipality.name}
          </p>
        )}
      </div>
      <p className="hint-text">
        {people(interest.country)} har {name}
        {children.length > 0 && ' eller något under det'}. Du själv räknas inte.
      </p>

      {(ancestors.length > 0 || children.length > 0) && (
        <p className="hint-text">
          Siffrorna efter intressena: antal i hela Sverige{municipality && ` / i ${municipality.name}`}.
        </p>
      )}
      {ancestors.length > 0 && <InterestLinks heading="Del av" items={ancestors} municipality={municipality} />}
      {children.length > 0 && (
        // De som flest har först, så att de man troligast letar efter syns utan att scrolla.
        <InterestLinks
          heading="Mer specifikt"
          items={[...children].sort((a, b) => b.country - a.country)}
          municipality={municipality}
        />
      )}

      <Link to={peopleSearch} className="secondary-button interest-page-people">
        {municipality ? `Hitta medlemmar i ${municipality.name}` : 'Hitta medlemmar'} som gillar {name}
      </Link>
    </section>
  )
}

// Över- eller underintressena som länkar till sina sidor, med antal i landet (och kommunen).
function InterestLinks({ heading, items, municipality }) {
  return (
    <div>
      <h2 className="card-subheading">{heading}</h2>
      <ul className="interest-tags">
        {items.map((item) => (
          <li key={item.id}>
            <Link
              to={interestPageHref(item.id)}
              className="interest-tag interest-page-link"
              aria-label={`${capitalize(item.name)}: ${people(item.country)} i Sverige${
                municipality ? `, ${item.municipality} i ${municipality.name}` : ''
              }`}
            >
              {capitalize(item.name)}
              <span className="interest-page-link-count" aria-hidden="true">
                {item.country}
                {municipality && ` / ${item.municipality}`}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}

export default InterestPage
