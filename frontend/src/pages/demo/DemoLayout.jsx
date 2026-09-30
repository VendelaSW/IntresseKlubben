import { Outlet, useNavigate } from 'react-router-dom'
import { DemoProvider, useDemo } from '../../hooks/useDemo'

function DemoBanner() {
  const { logout } = useDemo()
  const navigate = useNavigate()

  function restart() {
    logout()
    navigate('/demo')
  }

  return (
    <div className="demo-banner" role="note">
      <span>Demo · allt här är påhittat och sparas inte</span>
      <button type="button" className="text-button" onClick={restart}>
        Börja om
      </button>
    </div>
  )
}

// Ram runt alla /demo-sidor: delat tillstånd plus en tydlig demo-remsa.
function DemoLayout() {
  return (
    <DemoProvider>
      <DemoBanner />
      <Outlet />
    </DemoProvider>
  )
}

export default DemoLayout
