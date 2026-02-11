import { BrowserRouter, Routes, Route } from "react-router-dom";
import HomeScreen from "./components/HomeScreen";
import MakeCodeView from "./components/MakeCodeView";
import "./App.css";

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<HomeScreen />} />
        <Route path="/makecode" element={<MakeCodeView />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
