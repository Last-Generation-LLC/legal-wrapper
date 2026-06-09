/* App entry — renders after all components have registered themselves */
/* global React, ReactDOM, DesignCanvas, DCSection, DCArtboard, AssistantPage, ReviewPage */

function App() {
  return (
    <DesignCanvas>
      <DCSection id="pages" title="Legal Document Workspace" subtitle="Local-first legal workspace · dark theme · one straightforward option">
        <DCArtboard id="assistant" label="Assistant · chat with selected documents" width={1440} height={900}>
          <AssistantPage />
        </DCArtboard>
        <DCArtboard id="review" label="Review · tabular grid (docs × prompt columns)" width={1440} height={900}>
          <ReviewPage />
        </DCArtboard>
      </DCSection>
    </DesignCanvas>
  );
}

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<App />);
