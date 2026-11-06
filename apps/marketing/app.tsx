import { PageOutlet } from 'modulato'
import './styles/global.scss'
import { Header } from './shell/Header'

// The shell: everything outside <PageOutlet/> persists across navigation and
// reacts to the URL through useRoute()/useNavigation().
export default function App() {
  return (
    <>
      <Header />
      <PageOutlet />
    </>
  )
}
