import { Link } from 'react-router-dom'
import HomeLink from '../components/HomeLink'

function AccountChoice() {
  return (
    <div className="page">
      <HomeLink />
      <h1>Kom igång</h1>
      <p className="problem-statement">
        Har du redan ett konto, eller vill du skapa ett nytt?
      </p>
      <div className="account-choice-links">
        <Link to="/logga-in" className="account-choice-link">
          Logga in
        </Link>
        <Link to="/registrera" className="account-choice-link">
          Registrera dig
        </Link>
      </div>
    </div>
  )
}

export default AccountChoice
