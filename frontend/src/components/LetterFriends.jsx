import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { shortNames } from '../utils/shortNames'
import Avatar from './Avatar'
import DrawnArrow from './DrawnArrow'

// Kompisar man inte har skrivit till än, längst ner i Brev (SCRUM-320): runda bilder på en rad. Får de inte plats
// tonar raden ut åt det håll där det finns fler, och på dator finns en pil åt det hållet. På mobil sveper man.
function LetterFriends({ friends }) {
  const listRef = useRef(null)
  const [more, setMore] = useState({ left: false, right: false })
  const names = shortNames(friends)

  function update() {
    const list = listRef.current
    setMore({ left: list.scrollLeft > 1, right: list.scrollLeft + list.clientWidth < list.scrollWidth - 1 })
  }

  useEffect(() => {
    update()
    const observer = new ResizeObserver(update)
    observer.observe(listRef.current)
    return () => observer.disconnect()
  }, [friends.length])

  function scroll(direction) {
    const list = listRef.current
    const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    list.scrollBy({ left: direction * list.clientWidth * 0.8, behavior: still ? 'auto' : 'smooth' })
  }

  return (
    <div className="letter-friends">
      <h2 className="hint-text">Skriv ett första brev till</h2>
      <div className={`letter-friends-row${more.left ? ' has-more-left' : ''}${more.right ? ' has-more-right' : ''}`}>
        <ul ref={listRef} onScroll={update}>
          {friends.map((friend) => {
            const name = friend.name ?? friend.username
            return (
              <li key={friend.id}>
                <Link
                  to={`/meddelanden/${friend.id}`}
                  className="letter-friend"
                  aria-label={`Skriv till ${name}`}
                  title={name}
                >
                  <Avatar name={name} imageUrl={friend.image_url} className="person-list-avatar letter-friend-avatar" />
                  <span className="letter-friend-name">{names.get(friend.id)}</span>
                </Link>
              </li>
            )
          })}
        </ul>
        {more.left && (
          <button
            type="button"
            className="letter-friends-arrow is-left"
            aria-label="Visa tidigare kompisar"
            onClick={() => scroll(-1)}
          >
            <DrawnArrow />
          </button>
        )}
        {more.right && (
          <button
            type="button"
            className="letter-friends-arrow is-right"
            aria-label="Visa fler kompisar"
            onClick={() => scroll(1)}
          >
            <DrawnArrow />
          </button>
        )}
      </div>
    </div>
  )
}

export default LetterFriends
