import Intressekompis from '../components/Intressekompis'

// TEST: en helt tom sida med bara intressekompisen (components/Intressekompis.jsx), centrerad.
function KompisTest() {
  return (
    <div style={{ display: 'grid', placeItems: 'center', minHeight: '100dvh', padding: '1rem' }}>
      <Intressekompis width="min(92vw, 560px)" />
    </div>
  )
}

export default KompisTest
