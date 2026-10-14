import React from 'react'
import {createRoot} from 'react-dom/client'
import {MalikMarkdown} from '../components/sovereign/MalikMarkdown'
const text=JSON.parse(document.getElementById('qa-report').textContent)
createRoot(document.getElementById('root')).render(React.createElement(MalikMarkdown,{text,allowImages:false,autoPreview:false,visualContext:{question:'Расчёт по заданным данным без фотографий',streaming:false}}))
