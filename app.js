import {
  License
} from 'yfiles/lang'
import {
  ShapeNodeStyle,
  ImageNodeStyle
} from 'yfiles/styles-other'
import 'yfiles/view-layout-bridge'
import 'yfiles/layout-familytree';
import 'yfiles/layout-multipage';
import {
  OrganicLayout,
  OrganicRemoveOverlapsStage
} from 'yfiles/layout-organic';
import 'yfiles/layout-orthogonal-compact';
import {
  RadialLayout
} from 'yfiles/layout-radial';
import 'yfiles/layout-seriesparallel';
import 'yfiles/view-graphml';
import 'yfiles/view-layout-bridge';
import 'yfiles/view-table';

// Tell the library about the license contents
License.value = {
  "comment": "13cb1e1e-3a03-43e8-9bf0-24330e8b8774",
  "date": "02/27/2019",
  "distribution": false,
  "domains": [
      "*"
  ],
  "expires": "04/29/2019",
  "fileSystemAllowed": true,
  "licensefileversion": "1.1",
  "localhost": true,
  "oobAllowed": true,
  "package": "complete",
  "product": "yFiles for HTML",
  "type": "eval",
  "version": "2.1",
  "watermark": "yFiles HTML Evaluation License (expires in ${license-days-remaining} days)",
  "key": "9ab7825f647f68abf2f48af17d6fade71a8ff007"
};

import {
  GraphBuilder,
  GraphComponent,
  GraphInputMode,
  ShapeNodeStyle,
  Size,
  PolylineEdgeStyle,
  EdgePathLabelModel,
  INode,
  IEdge,
  GraphItemTypes,
  Stroke,
  NodeStyleDecorationInstaller,
  EdgeStyleDecorationInstaller,
  StyleDecorationZoomPolicy,
  Color,

} from 'yfiles/view-component'

import 'yfiles/view-layout-bridge'
import {
  RadialLayoutData
} from 'yfiles/view-layout-bridge'

import neo4j from 'neo4j-driver/lib/browser/neo4j-web'


// setup the driver
const neo4jDriver = neo4j.driver("bolt://localhost:7687", neo4j.auth.basic("neo4j", "123"))
//Setup layout properties
const organicLayout = new OrganicLayout();
organicLayout.chainSubstructureStyle = "STRAIGHT_LINE"
organicLayout.cycleSubstructureStyle = "CIRCULAR"
organicLayout.parallelSubstructureStyle = "STRAIGHT_LINE"
organicLayout.starSubstructureStyle = "SEPARATED_RADIAL"
organicLayout.minimumNodeDistance = 60
organicLayout.considerNodeLabels = true
organicLayout.considerNodeSizes = true
organicLayout.deterministic = true
organicLayout.parallelEdgeRouterEnabled = false
const ac = new OrganicRemoveOverlapsStage(organicLayout)
// hook up the graph control to the div in the page
const graphComponent = new GraphComponent('#graphComponent')
// make it interactive - we don't allow editing (creating new elements)
// but are generally interested in viewing, only
const inputMode = new GraphInputMode()
graphComponent.inputMode = inputMode
// display a tooltip when the mouse hovers over an item
inputMode.addQueryItemToolTipListener((sender, args) => {
  // the neo4j data is stored in the "tag" property of the item
  // if it contains "properties" - show them in an HTML list
  if (args.item && args.item.tag && args.item.tag.properties) {

      // we can use a string, or set a HTML Element (e.g. when we do not trust the data)

      args.toolTip =

          `<ul style="background-color:white;width:100px;height:100%;">
      ${Object.entries(args.item.tag).map( e => '<li>' + e[0] + ' : ' + e[1] + '</li>').join('')}
      ${Object.entries(args.item.tag.properties).map( e => '<li>' + e[0] + ' : ' + e[1] + '</li>').join('')}
      
      </ul>`

  }
  if (args.item.tag.labels) {
      args.toolTip =
          `<ul style="background-color:white; width:100%;height:100%; ">
    ${Object.entries(args.item.tag.properties).map( e => '<li>' + e[0] + ' : ' + e[1] + '</li>').join('')}
    ${Object.entries(args.item.tag.labels).map( e => '<li>' + 'Labels' + ' : ' + e[1] + '</li>').join('')}
      
      </ul>`

  }
})
// Highlight Setup
inputMode.itemHoverInputMode.enabled = true
inputMode.itemHoverInputMode.hoverItems =
  GraphItemTypes.EDGE | GraphItemTypes.NODE
inputMode.itemHoverInputMode.discardInvalidItems = false
inputMode.itemHoverInputMode.addHoveredItemChangedListener(onHoveredItemChanged)
// when the user double-clicks on a node, we want to focus that node in the layout
var flag = true
inputMode.addItemDoubleClickedListener(async (sender, args) => {

  // clicks could also be on a label, edge, port, etc.
  if (INode.isInstance(args.item) && flag) {
      // tell the engine that we don't want the default action to happen
      args.handled = true
      // we configure the layout data
      const layoutData = new RadialLayoutData()
      // and tell it to put the item into the center
      layoutData.centerNodes.items.add(args.item)
      // we build the layout algorithm
      const layout = new RadialLayout()
      // and tell it to use the custom policy to determine the nodes in the center
      layout.centerNodesPolicy = "custom"
      // now we calculate the layout and morph the results
      await graphComponent.morphLayout({
          layout,
          layoutData
      })
      flag = false
  } else {
      flag = true
      await graphComponent.morphLayout(ac)
  }
})


// this function will be executed at startup - it performs the main setup
async function loadGraph() {
  var nodeResult = null;
  // first we query a limited number of arbitrary nodes
  // modify the query to suit your requirement!

  const query = "MATCH (n) return n "
  // regex to extract labels currently can extract only the first label of each node
  var nodekeys = query.match(/(\([A-z0-9]*:)|(\([A-z0-9]\))/g);
  // store labels
  var nodekey = [];
  for (var i = 0; i < nodekeys.length; i++) {
      nodekey[i] = nodekeys[i].substring(1, nodekeys[i].length - 1)
  }
  
  nodeResult = await runCypherQuery(query)
  // we put the resulting records in a separate array
  // concat nodes for each labels
  var nodes = nodeResult.records.map(record => record.get(nodekey[0]))
  for (var i = 1; i < nodekey.length; i++) {
      nodes = nodes.concat(nodeResult.records.map(record => record.get(nodekey[i])))
  }

  
  // and we store all node identities in a separate array
  const nodeIds = nodes.map(node => node.identity)

  // with the node ids we can query the edges between the nodes
  const edgeResult = await runCypherQuery(
      `MATCH (n)-[edge]-(m) 
            WHERE id(n) IN $nodeIds 
            AND id(m) IN $nodeIds
            RETURN DISTINCT edge`, {
          nodeIds
      })
  // and store the edges in an array
  const edges = edgeResult.records.map(record => record.get("edge"))

  // now we create the helper class that will help us build the graph declaratively from the data
  const graphBuilder = new GraphBuilder(graphComponent.graph)
  // the default size
  graphBuilder.graph.nodeDefaults.size = new Size(100, 30)
  // and also we specify the placements for the labels.
  graphBuilder.graph.edgeDefaults.labels.layoutParameter = 
      new EdgePathLabelModel({distance: 3, autoRotation:true, sideOfEdge:"ABOVE_EDGE"}).
      createDefaultParameter()

  // now we pass it the collection of nodes 
  graphBuilder.nodesSource = nodes
  // and tell it how to identify the nodes
  graphBuilder.nodeIdBinding = node => node.identity.toString()
  // as well as what text to use as the first label for each node
  graphBuilder.nodeLabelBinding = node => node.properties.name

  // pass the edges, too
  graphBuilder.edgesSource = edges
  // and tell it how to identify the source nodes - this matches the nodeIdBinding above
  graphBuilder.sourceNodeBinding = edge => edge.start.toString()
  // the same for the target side of the relations
  graphBuilder.targetNodeBinding = edge => edge.end.toString()
  // and we display the label, too, using the type of the relationship
   graphBuilder.edgeLabelBinding = edge => edge.properties.relationship
  // with the following customization we specify a different style for the nodes
  const movieStyle = new ShapeNodeStyle({
      shape: "DIAMOND",
      fill: "yellow"
  })
  const movieStyle2 = new ShapeNodeStyle({
      shape: "HEXAGON",
      fill: "red"
  })

  // whenever a node is created...
  graphBuilder.addNodeCreatedListener((sender, args) => {
      // ...and it is labelled as Movie
      if (args.sourceObject.properties.name=="Michele") {
          // we set a custom default style for all nodes    
          args.graph.setStyle(args.item, movieStyle)      
          args.graph.nodeDefaults.size = new Size(100, 30)
      }
      if (args.sourceObject.properties.name=="Tom") {
        // we set a custom default style for all nodes    
        args.graph.setStyle(args.item, movieStyle2)      
        args.graph.nodeDefaults.size = new Size(100, 30)
    }
      
      if (args.sourceObject.properties.name=="Julian") {
        
        const image = new ImageNodeStyle({
          image: "https://cdn.pixabay.com/photo/2018/02/09/21/46/rose-3142529__340.jpg"})     
          args.graph.nodeDefaults.size = new Size(100, 30)
          args.graph.setStyle(args.item, image)

      }
  })

  // similar to the above code, we also change the appearance of the "ACTED_IN" relationship
  // to a customized visualization
  const actedInStyle = new PolylineEdgeStyle({
      stroke: "medium blue",
      smoothingLength: 30,
      targetArrow: "black simple"
  })
  const actedInStyle2 = new PolylineEdgeStyle({
      stroke: "thick red",
      smoothingLength: 30,
      targetArrow: "red default"
  })
  const actedInStyle1 = new PolylineEdgeStyle({
    stroke: "5px yellow",
    smoothingLength: 30,
    targetArrow: "red default"
})
const actedInStyle3 = new PolylineEdgeStyle({
  stroke: "20px purple",
  smoothingLength: 30,
  targetArrow: "orange circle"
})
  // for each added edge...
  graphBuilder.addEdgeCreatedListener((sender, args) => {
      // .. of type "ACTED_IN"
      if (args.sourceObject.properties.relationship=="knows") {
          // set the predefined style
          args.graph.setStyle(args.item, actedInStyle)
      } else if (args.sourceObject.properties.relationship=="friend") {
          // set the predefined style
          args.graph.setStyle(args.item, actedInStyle2)
      }
      else if (args.sourceObject.properties.relationship=="wife") {
        // set the predefined style
        args.graph.setStyle(args.item, actedInStyle1)
    }
    else if (args.sourceObject.properties.relationship=="co-worker") {
      // set the predefined style
      args.graph.setStyle(args.item, actedInStyle3)
  }
  })

  // this triggers the initial construction of the graph
  graphBuilder.buildGraph()




  // the graph does not have a layout at this point, so we run a simple radial layout
  await graphComponent.morphLayout(ac)

}

function initializeHighlighting() {
  const orangeRed = Color.BLACK
  const orangeStroke = new Stroke(orangeRed.r, orangeRed.g, orangeRed.b, 220, 3)
  orangeStroke.freeze()

  const decorator = graphComponent.graph.decorator

  const highlightShape = new ShapeNodeStyle()
  highlightShape.shape = ShapeNodeStyle.ROUND_RECTANGLE
  highlightShape.stroke = orangeStroke,
      highlightShape.fill = null

  const nodeStyleHighlight = new NodeStyleDecorationInstaller({
      nodeStyle: highlightShape,
      margins: 5,
      zoomPolicy: StyleDecorationZoomPolicy.VIEW_COORDINATES
  })
  decorator.nodeDecorator.highlightDecorator.setImplementation(nodeStyleHighlight)


  const edgeStyle = new PolylineEdgeStyle({
      stroke: orangeStroke
  })
  const edgeStyleHighlight = new EdgeStyleDecorationInstaller({
      edgeStyle,
      zoomPolicy: StyleDecorationZoomPolicy.VIEW_COORDINATES
  })
  decorator.edgeDecorator.highlightDecorator.setImplementation(edgeStyleHighlight)

  //graphComponent.addCurrentItemChangedListener(onCurrentItemChanged)
}

function onHoveredItemChanged(sender, hoveredItemChangedEventArgs) {
  // we use the highlight manager of the GraphComponent to highlight related items
  const manager = graphComponent.highlightIndicatorManager

  // first remove previous highlights
  manager.clearHighlights()
  // then see where we are hovering over, now
  const newItem = hoveredItemChangedEventArgs.item
  if (newItem !== null) {
      // we highlight the item itself
      manager.addHighlight(newItem)
      if (INode.isInstance(newItem)) {
          // and if it's a node, we highlight all adjacent edges, too
          graphComponent.graph.outEdgesAt(newItem).forEach(edge => {
              manager.addHighlight(edge)
          })
      } else if (IEdge.isInstance(newItem)) {
          // if it's an edge - we highlight the adjacent nodes
          manager.addHighlight(newItem.sourceNode)
          manager.addHighlight(newItem.targetNode)
      }
  }
}
// asynchronous helper function that executes a query with parameters
// *and* closes the session again 
async function runCypherQuery(query, params) {
  const session = neo4jDriver.session('READ')
  try {
      return await session.run(query, params)
  } finally {
      session.close()
  }
}

// trigger the loading
loadGraph()
initializeHighlighting()