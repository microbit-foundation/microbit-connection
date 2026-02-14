import { BrowserRouter, Routes, Route } from "react-router-dom";
import HomeScreen from "./components/HomeScreen";
import MakeCodeView from "./components/MakeCodeView";
import "./App.css";
import ConnectionProvider from "./components/ConnectionProvider";
import { createBluetoothConnection } from "@microbit/microbit-connection/bluetooth";

const connection = createBluetoothConnection();

function App() {
  return (
    <ConnectionProvider connection={connection}>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<HomeScreen />} />
          <Route path="/makecode" element={<MakeCodeView />} />
        </Routes>
      </BrowserRouter>
    </ConnectionProvider>
  );
}

export default App;
