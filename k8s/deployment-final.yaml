pipeline {
    agent any
    
    environment {
        AWS_REGION         = 'us-west-2'
        ECR_REGISTRY       = '889818960214.dkr.ecr.us-west-2.amazonaws.com'
        ECR_REPO_NAME      = 'my-app-repo'
        EKS_CLUSTER_NAME   = 'my-eks-cluster'
        AWS_CREDENTIALS_ID = 'aws-credentials'
        SONAR_SCANNER_HOME = tool 'SonarScanner-latest'
    }

    stages {
        stage('Checkout') {
            steps {
                echo "🔄 Checking out code from branch: ${env.BRANCH_NAME}"
                checkout scm
            }
        }

        stage('SonarQube Analysis') {
            steps {
                withSonarQubeEnv('MySonarQubeServer') {
                    sh "${SONAR_SCANNER_HOME}/bin/sonar-scanner"
                }
            }
        }

        stage('Quality Gate') {
            steps {
                timeout(time: 5, unit: 'MINUTES') {
                    waitForQualityGate abortPipeline: true
                }
            }
        }

        stage('Build, Scan & Push Images') {
            parallel {
                stage('Build Backend') {
                    steps {
                        catchError(buildResult: 'UNSTABLE', stageResult: 'FAILURE') {
                            dir('backend') {
                                script {
                                    sh '''
                                        if [ ! -f package-lock.json ]; then
                                            echo "🔧 package-lock.json not found. Running npm install to generate it."
                                            npm install
                                        fi
                                        npm ci || npm install
                                    '''

                                    def imageName = "${ECR_REGISTRY}/${ECR_REPO_NAME}:3tier-nodejs-backend-${env.BUILD_ID}"
                                    def backendImage = docker.build(imageName, '.')

                                    // Security scan
                                    sh "trivy image --exit-code 0 --severity HIGH,CRITICAL ${imageName}"

                                    // Push to ECR
                                    docker.withRegistry("https://${ECR_REGISTRY}", "ecr:${AWS_REGION}:${AWS_CREDENTIALS_ID}") {
                                        backendImage.push()
                                        // Also push with 'latest' tag
                                        backendImage.push("3tier-nodejs-backend-latest")
                                    }
                                    env.BACKEND_SUCCESS = 'true'
                                    env.BACKEND_IMAGE_TAG = "3tier-nodejs-backend-${env.BUILD_ID}"
                                }
                            }
                        }
                    }
                }

                stage('Build Frontend') {
                    steps {
                        dir('frontend') {
                            script {
                                sh '''
                                    if [ ! -f package-lock.json ]; then
                                        echo "🔧 package-lock.json not found. Running npm install to generate it."
                                        npm install
                                    fi
                                    npm ci || npm install
                                '''

                                sh 'export NODE_OPTIONS=--openssl-legacy-provider && npm run build'

                                def imageName = "${ECR_REGISTRY}/${ECR_REPO_NAME}:3tier-nodejs-frontend-${env.BUILD_ID}"
                                def frontendImage = docker.build(imageName, '.')

                                // Security scan
                                sh "trivy image --exit-code 0 --severity HIGH,CRITICAL ${imageName}"

                                // Push to ECR
                                docker.withRegistry("https://${ECR_REGISTRY}", "ecr:${AWS_REGION}:${AWS_CREDENTIALS_ID}") {
                                    frontendImage.push()
                                    // Also push with 'latest' tag
                                    frontendImage.push("3tier-nodejs-frontend-latest")
                                }
                                env.FRONTEND_SUCCESS = 'true'
                                env.FRONTEND_IMAGE_TAG = "3tier-nodejs-frontend-${env.BUILD_ID}"
                            }
                        }
                    }
                }
            }
        }

        stage('Update Kubernetes Manifests') {
            when {
                anyOf {
                    environment name: 'FRONTEND_SUCCESS', value: 'true'
                    environment name: 'BACKEND_SUCCESS', value: 'true'
                }
            }
            steps {
                script {
                    echo "📝 Updating Kubernetes manifests with new image tags..."
                    
                    // Create a temporary copy of deployment manifest with updated image tags
                    sh '''
                        # Create k8s-temp directory 
                        mkdir -p k8s-temp
                        
                        # Copy original manifest from k8s folder
                        cp k8s/deployment-final.yaml k8s-temp/deployment-updated.yaml
                    '''
                    
                    // Update backend image if build was successful
                    if (env.BACKEND_SUCCESS == 'true') {
                        sh """
                            sed -i 's|889818960214.dkr.ecr.us-west-2.amazonaws.com/my-app-repo:3tier-nodejs-backend-latest|${ECR_REGISTRY}/${ECR_REPO_NAME}:${env.BACKEND_IMAGE_TAG}|g' k8s-temp/deployment-updated.yaml
                        """
                        echo "✅ Updated backend image to: ${env.BACKEND_IMAGE_TAG}"
                    }
                    
                    // Update frontend image if build was successful
                    if (env.FRONTEND_SUCCESS == 'true') {
                        sh """
                            sed -i 's|889818960214.dkr.ecr.us-west-2.amazonaws.com/my-app-repo:3tier-nodejs-frontend-latest|${ECR_REGISTRY}/${ECR_REPO_NAME}:${env.FRONTEND_IMAGE_TAG}|g' k8s-temp/deployment-updated.yaml
                        """
                        echo "✅ Updated frontend image to: ${env.FRONTEND_IMAGE_TAG}"
                    }
                    
                    // Show the changes
                    sh '''
                        echo "📋 Updated manifest preview:"
                        cat k8s-temp/deployment-updated.yaml | grep "image:" || true
                    '''
                }
            }
        }

        stage('Deploy to EKS') {
            when {
                anyOf {
                    environment name: 'FRONTEND_SUCCESS', value: 'true'
                    environment name: 'BACKEND_SUCCESS', value: 'true'
                }
            }
            steps {
                withAWS(credentials: AWS_CREDENTIALS_ID, region: AWS_REGION) {
                    sh "aws eks update-kubeconfig --name ${EKS_CLUSTER_NAME} --region ${AWS_REGION}"

                    script {
                        echo "🚀 Deploying to EKS cluster..."
                        
                        // Deploy AWS Load Balancer Controller Service Account (if not exists)
                        sh '''
                            echo "📦 Deploying AWS Load Balancer Controller Service Account..."
                            kubectl apply -f k8s/aws-load-balancer-controller-service-account.yaml || true
                        '''
                        
                        // Deploy Ingress Class (if not exists)
                        sh '''
                            echo "📦 Deploying Ingress Class..."
                            kubectl apply -f k8s/ingress-class.yaml || true
                        '''
                        
                        // Deploy the main application
                        sh '''
                            echo "📦 Deploying application manifests..."
                            kubectl apply -f k8s-temp/deployment-updated.yaml
                            
                            echo "⏳ Waiting for deployments to be ready..."
                            kubectl rollout status deployment/backend-deployment --timeout=300s || true
                            kubectl rollout status deployment/frontend-deployment --timeout=300s || true
                        '''
                        
                        // Verify deployment
                        sh '''
                            echo "📊 Deployment Status:"
                            echo "==================="
                            
                            echo "🔍 Pods Status:"
                            kubectl get pods -l 'app in (backend,frontend)' -o wide
                            
                            echo ""
                            echo "🔍 Services Status:"
                            kubectl get services -l 'app in (backend,frontend)'
                            
                            echo ""
                            echo "🔍 Ingress Status:"
                            kubectl get ingress my-app-ingress
                            
                            echo ""
                            echo "🔍 Load Balancer URL:"
                            kubectl get ingress my-app-ingress -o jsonpath='{.status.loadBalancer.ingress[0].hostname}' || echo "Load balancer not ready yet"
                        '''
                        
                        // Check for any issues
                        sh '''
                            echo ""
                            echo "🔍 Checking for any issues:"
                            echo "=========================="
                            
                            # Check failed pods
                            FAILED_PODS=$(kubectl get pods -l 'app in (backend,frontend)' --field-selector=status.phase!=Running --no-headers 2>/dev/null | wc -l)
                            if [ "$FAILED_PODS" -gt 0 ]; then
                                echo "⚠️  Found $FAILED_PODS failed/pending pods:"
                                kubectl get pods -l 'app in (backend,frontend)' --field-selector=status.phase!=Running
                                echo ""
                                echo "📋 Pod descriptions for troubleshooting:"
                                kubectl describe pods -l 'app in (backend,frontend)' --field-selector=status.phase!=Running
                            else
                                echo "✅ All pods are running successfully!"
                            fi
                        '''
                    }
                }
            }
        }
    }

    post {
        always {
            // Clean up temporary files
            sh 'rm -rf k8s-temp || true'
        }
        
        failure {
            echo "❌ Build failed."
            script {
                if (currentBuild.currentResult == 'FAILURE') {
                    sh '''
                        echo "🔍 Troubleshooting Information:"
                        echo "==============================="
                        
                        # Show recent events
                        echo "📋 Recent Kubernetes Events:"
                        kubectl get events --sort-by=.metadata.creationTimestamp --field-selector type=Warning | tail -10 || true
                        
                        # Show pod logs if any pods are failing
                        echo ""
                        echo "📋 Pod Logs for Failed Pods:"
                        for pod in $(kubectl get pods -l 'app in (backend,frontend)' --field-selector=status.phase!=Running -o name 2>/dev/null); do
                            echo "--- Logs for $pod ---"
                            kubectl logs $pod --tail=50 || true
                            echo ""
                        done
                    '''
                }
            }
        }
        
        success {
            echo "✅ Build and deploy successful!"
            sh '''
                echo "🎉 Application Deployed Successfully!"
                echo "===================================="
                
                # Show final status
                echo "📊 Final Application Status:"
                kubectl get all -l 'app in (backend,frontend)'
                
                echo ""
                echo "🌐 Access your application:"
                LB_HOSTNAME=$(kubectl get ingress my-app-ingress -o jsonpath='{.status.loadBalancer.ingress[0].hostname}' 2>/dev/null || echo "")
                if [ -n "$LB_HOSTNAME" ]; then
                    echo "Frontend: http://$LB_HOSTNAME"
                    echo "Backend API: http://$LB_HOSTNAME/api"
                else
                    echo "⏳ Load balancer is still being provisioned. Check again in a few minutes:"
                    echo "kubectl get ingress my-app-ingress"
                fi
            '''
        }
        
        unstable {
            echo "⚠️ Build completed with warnings."
        }
    }
}
