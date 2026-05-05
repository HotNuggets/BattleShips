import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import Battleships from '../src/battleships.js'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <Battleships />
  </StrictMode>,
)
