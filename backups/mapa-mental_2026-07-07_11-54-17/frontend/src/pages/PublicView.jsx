import { useEffect, useMemo, useState } from "react";
import { useParams, Link } from "react-router-dom";
import ReactFlow, { Background, Controls, MiniMap, ReactFlowProvider } from "reactflow";
import "reactflow/dist/style.css";
import api from "../lib/api";
import MindNode from "../components/MindNode";
import { Brain, Globe } from "@phosphor-icons/react";

const FIT_VIEW_OPTIONS = { padding: 0.4, maxZoom: 1.2 };
const PRO_OPTIONS = { hideAttribution: true };

function PublicInner() {
  const { id } = useParams();
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const nodeTypes = useMemo(() => ({ mind: MindNode }), []);

  useEffect(() => {
    (async () => {
      try {
        const { data } = await api.get(`/public/maps/${id}`);
        setData(data);
      } catch (e) {
        setError("Este mapa não está disponível publicamente.");
      }
    })();
  }, [id]);

  if (error) {
    return (
      <div className="min-h-screen bg-[#FDFBF7] flex items-center justify-center p-6">
        <div className="brutal-border brutal-shadow-lg bg-white rounded-2xl p-8 max-w-md text-center">
          <h1 className="text-2xl font-extrabold mb-2">Ops!</h1>
          <p className="text-gray-600 mb-6">{error}</p>
          <Link to="/" className="brutal-btn bg-black text-white px-4 py-2 inline-block">
            Ir para o início
          </Link>
        </div>
      </div>
    );
  }
  if (!data) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#FDFBF7]">
        <div className="brutal-border brutal-shadow bg-white rounded-xl px-6 py-3 font-bold">
          Carregando...
        </div>
      </div>
    );
  }

  const nodes = (data.nodes || []).map((n) => ({ ...n, type: "mind" }));
  const edges = data.edges || [];

  return (
    <div className="h-screen w-screen flex flex-col bg-[#FDFBF7] overflow-hidden">
      <div className="brutal-border border-x-0 border-t-0 bg-white px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="brutal-border brutal-shadow-sm bg-[#FDE047] rounded-lg p-2">
            <Brain size={20} weight="duotone"/>
          </div>
          <div>
            <h1 className="font-extrabold text-lg tracking-tight">{data.title}</h1>
            <p className="text-xs text-gray-500 font-bold uppercase tracking-widest flex items-center gap-1">
              <Globe size={12} weight="bold"/> Visualização Pública
            </p>
          </div>
        </div>
        <Link to="/" className="brutal-btn bg-white px-3 py-2 text-sm">
          Criar meu mapa
        </Link>
      </div>
      <div className="flex-1">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          nodesDraggable={false}
          nodesConnectable={false}
          elementsSelectable={false}
          fitView
          fitViewOptions={FIT_VIEW_OPTIONS}
          proOptions={PRO_OPTIONS}
        >
          <Background color="#D1D5DB" gap={24} size={2} />
          <Controls showInteractive={false}/>
          <MiniMap pannable zoomable maskColor="rgba(0,0,0,0.05)" nodeColor={(n) => n.data?.color || "#FDE047"}/>
        </ReactFlow>
      </div>
    </div>
  );
}

export default function PublicView() {
  return (
    <ReactFlowProvider>
      <PublicInner />
    </ReactFlowProvider>
  );
}
